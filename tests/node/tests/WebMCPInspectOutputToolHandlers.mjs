import assert from "assert";
import {
    ANALYSIS_DECISION,
    ANALYSIS_STATE,
    AnalysisCoordinator,
} from "../../../src/web/analysis/AnalysisCoordinator.mjs";
import {
    AGENT_ANALYSIS_ERROR_CODE,
    AgentAnalysisError,
} from "../../../src/web/webmcp/AgentAnalysisError.mjs";
import {AgentAnalysisService} from "../../../src/web/webmcp/AgentAnalysisService.mjs";
import {createInspectOutputToolHandlers} from "../../../src/web/webmcp/InspectOutputToolHandlers.mjs";
import CollaborationSession, {
    MAX_SESSION_OUTPUT_ANALYSES,
} from "../../../src/web/webmcp/CollaborationSession.mjs";
import {executeTool} from "../../../src/web/webmcp/ToolExecutor.mjs";
import {
    TOOL_CONTRACTS,
    TOOL_NAME,
} from "../../../src/web/webmcp/ToolDefinitions.mjs";
import {TOOL_ERROR_CODE} from "../../../src/web/webmcp/ToolResult.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


const DATA_CANARIES = Object.freeze([
    "SECRET_INPUT_CANARY",
    "SECRET_OUTPUT_CANARY",
    "SECRET_ARGUMENT_CANARY",
    "SECRET_PREVIEW_CANARY",
    "SECRET_ERROR_CANARY",
    "PROMPT_INJECTION_CANARY",
]);


/**
 * Creates one settled internal analysis fixture containing sensitive decoys.
 *
 * @param {Object} [overrides={}] - Result fields to replace.
 * @returns {Object} Agent analysis service result.
 */
function createAnalysisResult(overrides={}) {
    return {
        decision: "started",
        analysis: {
            analysisId: 7,
            terminalState: ANALYSIS_STATE.SIGNALS_READY,
            target: {
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
            },
        },
        candidates: [{
            data: DATA_CANARIES[3],
            recipe: [
                {op: "From Base64", args: [DATA_CANARIES[2]]},
                {op: DATA_CANARIES[5], args: [DATA_CANARIES[0]]},
            ],
            languageScores: [{lang: "en", probability: 0.987654321}],
            fileType: {mime: "text/plain", name: DATA_CANARIES[1]},
            isUTF8: true,
            entropy: 4.123456789,
            matchingOps: [{op: "From Hex", args: [DATA_CANARIES[2]]}],
            error: DATA_CANARIES[4],
        }],
        rawInput: DATA_CANARIES[0],
        rawOutput: DATA_CANARIES[1],
        ...overrides,
    };
}


/**
 * Executes the protected inspection handler through the shared result boundary.
 *
 * @param {Object} service - Agent analysis service fixture.
 * @param {Object} [input={bakeId: 11}] - Tool input.
 * @param {CollaborationSession|null} [session=null] - Optional active Session.
 * @returns {Promise<Object>} Final tool result envelope.
 */
async function executeInspection(service, input={bakeId: 11}, session=null) {
    const handler = createInspectOutputToolHandlers(service)[TOOL_NAME.INSPECT_OUTPUT],
        collaboration = session ?? new CollaborationSession(true, () => 5);
    if (collaboration.getState().state === "off") collaboration.start();
    return await executeTool(
        TOOL_CONTRACTS[TOOL_NAME.INSPECT_OUTPUT],
        (value, signal) => collaboration.execute(handler, value, signal),
        input
    );
}


/**
 * Connects the real Agent analysis service to deterministic Output and Worker adapters.
 *
 * @param {boolean} [deferCompletion=false] - Whether new analysis remains active.
 * @returns {Object} Service, mutable Output target, Session, and scheduling evidence.
 */
function createIntegratedFixture(deferCompletion=false) {
    let provenance = createAnalysisResult().analysis.target,
        notifyStarted;
    const analyses = new AnalysisCoordinator(),
        evidence = {startCount: 0, analysisId: null},
        started = new Promise(resolve => {
            notifyStarted = resolve;
        }),
        manager = {
            analyses,
            output: {
                captureAnalysisInput: async bakeId => bakeId === provenance.bakeId ? {
                    provenance,
                    sample: new Uint8Array([65, 66, 67]).buffer,
                } : null,
                isCurrentOutputProvenance: value => value === provenance,
            },
            background: {
                invalidateAnalysis: () => {},
                magic: (sample, target, owner, signal) => {
                    const request = analyses.ensure(target, {owner, signal});
                    if (request.decision === ANALYSIS_DECISION.STARTED) {
                        evidence.startCount++;
                        evidence.analysisId = request.analysis.analysisId;
                        analyses.markRunning(request.analysis.analysisId);
                        if (deferCompletion) {
                            notifyStarted();
                        } else {
                            analyses.settle(
                                request.analysis.analysisId,
                                ANALYSIS_STATE.SIGNALS_READY,
                                createAnalysisResult().candidates
                            );
                        }
                    }
                    return request;
                },
            },
        },
        session = new CollaborationSession(true, () => 9);
    session.start();

    return {
        service: new AgentAnalysisService(manager),
        session,
        analyses,
        evidence,
        started,
        setBakeId: bakeId => {
            provenance = Object.freeze({
                ...createAnalysisResult().analysis.target,
                bakeId,
                outputVersion: bakeId,
            });
        },
    };
}


TestRegister.addApiTests([
    it("WebMCPInspectOutputToolHandlers: should return only approved derived fields", async () => {
        let receivedBakeId,
            receivedInvocation;
        const result = await executeInspection({
                inspectCurrentOutput: async (bakeId, invocation) => {
                    receivedBakeId = bakeId;
                    receivedInvocation = invocation;
                    return createAnalysisResult();
                },
            }),
            serialized = JSON.stringify(result);

        assert.equal(receivedBakeId, 11);
        assert(receivedInvocation.signal instanceof AbortSignal);
        assert.deepStrictEqual(result.state, {sessionEpoch: 5});
        assert.deepStrictEqual(result.data, {
            analysisId: 7,
            analysisState: ANALYSIS_STATE.SIGNALS_READY,
            bakeId: 11,
            recipeRevision: 7,
            inputTabId: 1,
            inputGeneration: "3:1",
            inputRevision: 4,
            executionOptionsVersion: 2,
            outputTabId: 1,
            outputGeneration: 6,
            outputVersion: 9,
            isUtf8: true,
            detectedTypeId: "document",
            entropyBand: "medium",
            topLanguageId: "en",
            matchingOperationNames: ["From Hex"],
            candidateOperationNames: ["From Base64"],
        });
        for (const canary of DATA_CANARIES) assert.equal(serialized.includes(canary), false);
        for (const exactScore of ["0.987654321", "4.123456789"]) {
            assert.equal(serialized.includes(exactScore), false);
        }
    }),

    it("WebMCPInspectOutputToolHandlers: should map every reviewed analysis failure", async () => {
        for (const code of Object.values(AGENT_ANALYSIS_ERROR_CODE)) {
            const result = await executeInspection({
                inspectCurrentOutput: async () => {
                    throw new AgentAnalysisError(code);
                },
            });
            assert.equal(result.error.code, code);
        }
    }),

    it("WebMCPInspectOutputToolHandlers: should contain invalid internal results", async () => {
        for (const service of [
            {
                inspectCurrentOutput: async () => createAnalysisResult({
                    analysis: null,
                }),
            },
            {
                inspectCurrentOutput: async () => {
                    throw new Error(DATA_CANARIES[4]);
                },
            },
        ]) {
            const result = await executeInspection(service);
            assert.equal(result.error.code, TOOL_ERROR_CODE.INTERNAL_ERROR);
            assert.equal(JSON.stringify(result).includes(DATA_CANARIES[4]), false);
        }
    }),

    it("WebMCPInspectOutputToolHandlers: should reject invalid or extra input", async () => {
        const service = {inspectCurrentOutput: async () => createAnalysisResult()};
        for (const input of [
            {bakeId: 0},
            {bakeId: 11, reason: DATA_CANARIES[5]},
        ]) {
            const result = await executeInspection(service, input);
            assert.equal(result.error.code, TOOL_ERROR_CODE.INVALID_REQUEST);
            assert.equal(JSON.stringify(result).includes(DATA_CANARIES[5]), false);
        }
    }),

    it("WebMCPInspectOutputToolHandlers: should reuse cache without consuming Session budget", async () => {
        const fixture = createIntegratedFixture(),
            first = await executeInspection(fixture.service, {bakeId: 11}, fixture.session);
        for (let i = 0; i < 3; i++) {
            const cached = await executeInspection(
                fixture.service,
                {bakeId: 11},
                fixture.session
            );
            assert.equal(cached.data.analysisId, first.data.analysisId);
        }

        for (let bakeId = 2; bakeId <= MAX_SESSION_OUTPUT_ANALYSES; bakeId++) {
            fixture.setBakeId(bakeId);
            const result = await executeInspection(
                fixture.service,
                {bakeId},
                fixture.session
            );
            assert.equal(result.ok, true);
        }
        fixture.setBakeId(MAX_SESSION_OUTPUT_ANALYSES + 1);
        const exhausted = await executeInspection(
            fixture.service,
            {bakeId: MAX_SESSION_OUTPUT_ANALYSES + 1},
            fixture.session
        );

        assert.equal(fixture.evidence.startCount, MAX_SESSION_OUTPUT_ANALYSES);
        assert.equal(exhausted.error.code, TOOL_ERROR_CODE.ANALYSIS_BUDGET_EXHAUSTED);
    }),

    it("WebMCPInspectOutputToolHandlers: should end active analysis when Session stops", async () => {
        const fixture = createIntegratedFixture(true),
            execution = executeInspection(
                fixture.service,
                {bakeId: 11},
                fixture.session
            );

        await fixture.started;
        fixture.session.stop();
        const result = await execution,
            analysis = fixture.analyses.getAnalysis(fixture.evidence.analysisId);

        assert.equal(result.error.code, TOOL_ERROR_CODE.SESSION_ENDED);
        assert.equal(analysis.terminalState, ANALYSIS_STATE.CANCELLED);
    }),
]);
