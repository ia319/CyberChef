import assert from "assert";
import {
    ANALYSIS_DECISION,
    ANALYSIS_OWNER,
    ANALYSIS_STATE,
    ANALYSIS_WAITER_ERROR_CODE,
    AnalysisCoordinator,
    analysisTargetMatches,
    createAnalysisTarget,
} from "../../../src/web/analysis/AnalysisCoordinator.mjs";
import {RUN_STATE} from "../../../src/web/run/RunCoordinator.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


/**
 * Creates a content-free completed Output fixture.
 *
 * @param {Object} [overrides={}] - Provenance properties to replace.
 * @returns {Object} Output provenance fixture.
 */
function createTarget(overrides={}) {
    return {
        bakeId: 8,
        recipeRevision: 4,
        inputTabId: 2,
        inputGeneration: "1:2",
        inputRevision: 3,
        outputTabId: 2,
        outputGeneration: 7,
        outputVersion: 5,
        executionOptionsVersion: 1,
        terminalState: RUN_STATE.COMPLETED,
        ...overrides,
    };
}


TestRegister.addApiTests([
    it("AnalysisCoordinator: should retain only content-free Output identity", () => {
        const target = createAnalysisTarget({
            ...createTarget(),
            data: "private output",
            error: "private error",
        });

        assert.deepStrictEqual(Object.keys(target), [
            "bakeId",
            "recipeRevision",
            "inputTabId",
            "inputGeneration",
            "inputRevision",
            "outputTabId",
            "outputGeneration",
            "outputVersion",
            "executionOptionsVersion",
            "terminalState",
        ]);
        assert.equal(Object.isFrozen(target), true);
        assert.equal(analysisTargetMatches(target, createTarget()), true);
        assert.equal(analysisTargetMatches(target, createTarget({outputVersion: 6})), false);
    }),

    it("AnalysisCoordinator: should reject invalid targets and requests", () => {
        const coordinator = new AnalysisCoordinator(),
            abortController = new AbortController();
        abortController.abort();

        assert.throws(() => coordinator.ensure(
            createTarget({terminalState: RUN_STATE.FAILED}),
            {owner: ANALYSIS_OWNER.UI}
        ), error => error.code === ANALYSIS_WAITER_ERROR_CODE.INVALID_ANALYSIS);
        assert.throws(() => coordinator.ensure(createTarget(), {owner: "unknown"}),
            error => error.code === ANALYSIS_WAITER_ERROR_CODE.INVALID_ANALYSIS
        );
        assert.throws(() => coordinator.ensure(createTarget(), {
            owner: ANALYSIS_OWNER.AGENT,
            signal: abortController.signal,
        }), error => error.code === ANALYSIS_WAITER_ERROR_CODE.ABORTED);
    }),

    it("AnalysisCoordinator: should join matching work and reject a different active target", async () => {
        const coordinator = new AnalysisCoordinator(),
            started = coordinator.ensure(createTarget(), {owner: ANALYSIS_OWNER.UI}),
            joined = coordinator.ensure(createTarget(), {owner: ANALYSIS_OWNER.AGENT}),
            busy = coordinator.ensure(createTarget({outputVersion: 6}), {
                owner: ANALYSIS_OWNER.AGENT,
            });

        assert.equal(started.decision, ANALYSIS_DECISION.STARTED);
        assert.equal(joined.decision, ANALYSIS_DECISION.JOINED);
        assert.equal(joined.analysis.analysisId, started.analysis.analysisId);
        assert.equal(busy.decision, ANALYSIS_DECISION.BUSY);
        assert.equal(coordinator.markRunning(started.analysis.analysisId), true);
        assert.equal(coordinator.markRunning(started.analysis.analysisId), false);
        assert.equal(coordinator.settle(
            started.analysis.analysisId,
            ANALYSIS_STATE.SIGNALS_READY,
            {candidate: "From Base64"}
        ), true);

        const [uiResult, agentResult] = await Promise.all([
            started.completion,
            joined.completion,
        ]);
        assert.deepStrictEqual(uiResult.value, {candidate: "From Base64"});
        assert.strictEqual(agentResult.value, uiResult.value);
        assert.equal(uiResult.analysis.terminalState, ANALYSIS_STATE.SIGNALS_READY);
        assert.equal(Object.prototype.hasOwnProperty.call(uiResult.analysis, "value"), false);
    }),

    it("AnalysisCoordinator: should cache signals and no-suggestion results", async () => {
        for (const [terminalState, value] of [
            [ANALYSIS_STATE.SIGNALS_READY, {isUtf8: true}],
            [ANALYSIS_STATE.NO_SUGGESTION, null],
        ]) {
            const coordinator = new AnalysisCoordinator(),
                started = coordinator.ensure(createTarget(), {owner: ANALYSIS_OWNER.UI});
            coordinator.settle(started.analysis.analysisId, terminalState, value);
            await started.completion;

            const cached = coordinator.ensure(createTarget(), {owner: ANALYSIS_OWNER.AGENT});
            assert.equal(cached.decision, ANALYSIS_DECISION.CACHED);
            assert.equal(cached.analysis.analysisId, started.analysis.analysisId);
            assert.strictEqual((await cached.completion).value, value);
        }
    }),

    it("AnalysisCoordinator: should not cache failure, timeout, cancellation or stale state", async () => {
        for (const terminalState of [
            ANALYSIS_STATE.FAILED,
            ANALYSIS_STATE.CANCELLED,
            ANALYSIS_STATE.STALE,
            ANALYSIS_STATE.TIMED_OUT,
        ]) {
            const coordinator = new AnalysisCoordinator(),
                started = coordinator.ensure(createTarget(), {owner: ANALYSIS_OWNER.UI});
            assert.equal(coordinator.settle(started.analysis.analysisId, terminalState), true);
            assert.equal(coordinator.settle(
                started.analysis.analysisId,
                ANALYSIS_STATE.SIGNALS_READY
            ), false);
            assert.equal((await started.completion).analysis.terminalState, terminalState);
            assert.equal(coordinator.ensure(createTarget(), {
                owner: ANALYSIS_OWNER.UI,
            }).decision, ANALYSIS_DECISION.STARTED);
        }
    }),

    it("AnalysisCoordinator: should time out and notify its Worker adapter", async () => {
        let timeoutCallback,
            timedOutAnalysis;
        const coordinator = new AnalysisCoordinator({
                setTimeoutFn: callback => {
                    timeoutCallback = callback;
                    return 7;
                },
                clearTimeoutFn: () => {},
                onTimeout: analysis => {
                    timedOutAnalysis = analysis;
                },
            }),
            started = coordinator.ensure(createTarget(), {owner: ANALYSIS_OWNER.UI});

        timeoutCallback();
        const result = await started.completion;
        assert.equal(result.analysis.terminalState, ANALYSIS_STATE.TIMED_OUT);
        assert.equal(timedOutAnalysis.analysisId, started.analysis.analysisId);
    }),

    it("AnalysisCoordinator: should cancel only work abandoned by every owner", async () => {
        const uiAbort = new AbortController(),
            agentAbort = new AbortController();
        let abandonedAnalysis = null;
        const coordinator = new AnalysisCoordinator({
                onAbandoned: analysis => {
                    abandonedAnalysis = analysis;
                },
            }),
            ui = coordinator.ensure(createTarget(), {
                owner: ANALYSIS_OWNER.UI,
                signal: uiAbort.signal,
            }),
            agent = coordinator.ensure(createTarget(), {
                owner: ANALYSIS_OWNER.AGENT,
                signal: agentAbort.signal,
            });

        agentAbort.abort();
        await assert.rejects(agent.completion, error =>
            error.code === ANALYSIS_WAITER_ERROR_CODE.ABORTED
        );
        assert.equal(abandonedAnalysis, null);
        assert.equal(coordinator.isActive(ui.analysis.analysisId), true);

        uiAbort.abort();
        await assert.rejects(ui.completion, error =>
            error.code === ANALYSIS_WAITER_ERROR_CODE.ABORTED
        );
        assert.equal(abandonedAnalysis.analysisId, ui.analysis.analysisId);
        assert.equal(abandonedAnalysis.terminalState, ANALYSIS_STATE.CANCELLED);
        assert.equal(coordinator.isActive(ui.analysis.analysisId), false);
    }),
]);
