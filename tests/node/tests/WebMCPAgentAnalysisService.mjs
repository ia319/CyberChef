import assert from "assert";
import {
    ANALYSIS_DECISION,
    ANALYSIS_OWNER,
    ANALYSIS_STATE,
    AnalysisCoordinator,
} from "../../../src/web/analysis/AnalysisCoordinator.mjs";
import {
    AGENT_ANALYSIS_ERROR_CODE,
    AgentAnalysisError,
} from "../../../src/web/webmcp/AgentAnalysisError.mjs";
import {AgentAnalysisService} from "../../../src/web/webmcp/AgentAnalysisService.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


/**
 * Creates one completed content-free Output provenance fixture.
 *
 * @param {Object} [overrides={}] - Provenance fields to replace.
 * @returns {Object} Immutable Output provenance.
 */
function createProvenance(overrides={}) {
    return Object.freeze({
        bakeId: 11,
        recipeRevision: 7,
        inputTabId: 1,
        inputGeneration: "3:1",
        inputRevision: 4,
        outputTabId: 1,
        outputGeneration: 6,
        outputVersion: 9,
        executionOptionsVersion: 2,
        terminalState: "completed",
        ...overrides,
    });
}


/**
 * Creates a deterministic Agent analysis service fixture.
 *
 * @param {Object} [options={}] - Analysis input and completion overrides.
 * @returns {Object} Service, invocation, coordinator, and captured evidence.
 */
function createFixture(options={}) {
    const provenance = options.provenance ?? createProvenance(),
        sample = options.sample ?? new Uint8Array([65, 66, 67]).buffer,
        candidates = options.candidates ?? [{isUTF8: true}],
        evidence = {
            captureCount: 0,
            budgetCount: 0,
            invalidateCount: 0,
            magicCount: 0,
            owner: null,
            signal: null,
        },
        controller = new AbortController(),
        analyses = new AnalysisCoordinator(),
        manager = {
            analyses,
            output: {
                captureAnalysisInput: async (bakeId, signal) => {
                    evidence.captureCount++;
                    evidence.signal = signal;
                    if (options.captureError) throw options.captureError;
                    if (options.captureStale || bakeId !== provenance.bakeId) return null;
                    return {provenance, sample};
                },
                isCurrentOutputProvenance: value =>
                    options.outputCurrent !== false && value === provenance,
            },
            background: {
                invalidateAnalysis: () => {
                    evidence.invalidateCount++;
                },
                magic: (value, target, owner, signal) => {
                    evidence.magicCount++;
                    evidence.owner = owner;
                    evidence.signal = signal;
                    if (options.magicError) throw options.magicError;
                    const request = analyses.ensure(target, {owner, signal});
                    if (request.decision === ANALYSIS_DECISION.STARTED &&
                        options.deferCompletion !== true) {
                        analyses.markRunning(request.analysis.analysisId);
                        analyses.settle(
                            request.analysis.analysisId,
                            options.terminalState ?? ANALYSIS_STATE.SIGNALS_READY,
                            options.terminalState &&
                                options.terminalState !== ANALYSIS_STATE.SIGNALS_READY ?
                                null : candidates
                        );
                    }
                    return request;
                },
            },
        },
        invocation = {
            signal: controller.signal,
            checkpoint: () => {
                if (controller.signal.aborted) throw controller.signal.reason;
            },
            consumeOutputAnalysis: () => {
                evidence.budgetCount++;
                if (options.budgetError) throw options.budgetError;
            },
        };

    return {
        service: new AgentAnalysisService(manager),
        invocation,
        analyses,
        controller,
        evidence,
        provenance,
        candidates,
    };
}


TestRegister.addApiTests([
    it("WebMCPAgentAnalysisService: should start and cache exact Output analysis", async () => {
        const fixture = createFixture(),
            started = await fixture.service.inspectCurrentOutput(11, fixture.invocation),
            cached = await fixture.service.inspectCurrentOutput(11, fixture.invocation);

        assert.equal(started.decision, ANALYSIS_DECISION.STARTED);
        assert.equal(cached.decision, ANALYSIS_DECISION.CACHED);
        assert.strictEqual(started.candidates, fixture.candidates);
        assert.strictEqual(cached.candidates, fixture.candidates);
        assert.equal(started.analysis.target.bakeId, 11);
        assert.equal(fixture.evidence.captureCount, 2);
        assert.equal(fixture.evidence.invalidateCount, 2);
        assert.equal(fixture.evidence.magicCount, 2);
        assert.equal(fixture.evidence.budgetCount, 1);
        assert.equal(fixture.evidence.owner, ANALYSIS_OWNER.AGENT);
        assert.strictEqual(fixture.evidence.signal, fixture.invocation.signal);
    }),

    it("WebMCPAgentAnalysisService: should join UI work without consuming budget", async () => {
        const fixture = createFixture({deferCompletion: true}),
            ui = fixture.analyses.ensure(fixture.provenance, {owner: ANALYSIS_OWNER.UI}),
            inspected = fixture.service.inspectCurrentOutput(11, fixture.invocation);

        await Promise.resolve();
        fixture.analyses.markRunning(ui.analysis.analysisId);
        fixture.analyses.settle(
            ui.analysis.analysisId,
            ANALYSIS_STATE.SIGNALS_READY,
            fixture.candidates
        );
        const result = await inspected;

        assert.equal(result.decision, ANALYSIS_DECISION.JOINED);
        assert.equal(result.analysis.analysisId, ui.analysis.analysisId);
        assert.equal(fixture.evidence.budgetCount, 0);
        await ui.completion;
    }),

    it("WebMCPAgentAnalysisService: should map bounded terminal failures", async () => {
        const cases = [
            [ANALYSIS_STATE.NO_SUGGESTION, AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_EMPTY],
            [ANALYSIS_STATE.FAILED, AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED],
            [ANALYSIS_STATE.TIMED_OUT, AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_TIMEOUT],
            [ANALYSIS_STATE.STALE, AGENT_ANALYSIS_ERROR_CODE.STALE_OUTPUT_ANALYSIS],
            [ANALYSIS_STATE.CANCELLED, AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED],
        ];
        for (const [terminalState, errorCode] of cases) {
            const fixture = createFixture({terminalState});
            await assert.rejects(
                fixture.service.inspectCurrentOutput(11, fixture.invocation),
                error => error instanceof AgentAnalysisError && error.code === errorCode
            );
        }
    }),

    it("WebMCPAgentAnalysisService: should reject empty, stale, and failed capture", async () => {
        for (const [options, errorCode] of [
            [{sample: new ArrayBuffer(0)}, AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_EMPTY],
            [{captureStale: true}, AGENT_ANALYSIS_ERROR_CODE.STALE_OUTPUT_ANALYSIS],
            [{captureError: new Error("PRIVATE_CAPTURE_ERROR")},
             AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED],
            [{outputCurrent: false}, AGENT_ANALYSIS_ERROR_CODE.STALE_OUTPUT_ANALYSIS],
        ]) {
            const fixture = createFixture(options);
            await assert.rejects(
                fixture.service.inspectCurrentOutput(11, fixture.invocation),
                error => error instanceof AgentAnalysisError && error.code === errorCode
            );
        }
    }),

    it("WebMCPAgentAnalysisService: should preserve budget and cancellation failures", async () => {
        const budgetError = new Error("BUDGET_BOUNDARY"),
            budgetFixture = createFixture({budgetError});
        await assert.rejects(
            budgetFixture.service.inspectCurrentOutput(11, budgetFixture.invocation),
            error => error === budgetError
        );
        assert.equal(budgetFixture.evidence.magicCount, 0);

        const cancelled = createFixture({deferCompletion: true}),
            pending = cancelled.service.inspectCurrentOutput(11, cancelled.invocation),
            reason = new DOMException("cancelled", "AbortError");
        await Promise.resolve();
        assert.equal(cancelled.evidence.magicCount, 1);
        cancelled.controller.abort(reason);
        await assert.rejects(pending, error => error === reason);
    }),
]);
