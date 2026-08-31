import assert from "assert";
import {RUN_DECISION, RUN_STATE} from "../../../src/web/run/RunCoordinator.mjs";
import {
    AGENT_BAKE_ERROR_CODE,
    AgentBakeError,
} from "../../../src/web/webmcp/AgentBakeError.mjs";
import {createBakeRecipeToolHandlers} from "../../../src/web/webmcp/BakeRecipeToolHandlers.mjs";
import CollaborationSession from "../../../src/web/webmcp/CollaborationSession.mjs";
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
    "SECRET_ERROR_CANARY",
    "SECRET_FILENAME_CANARY",
]);


/**
 * Creates one content-free settled Agent Bake fixture.
 *
 * @param {Object} [overrides={}] - Result fields to replace.
 * @returns {Object} Agent Bake service result.
 */
function createBakeResult(overrides={}) {
    const target = Object.freeze({
            bakeId: 11,
            recipeRevisionAtStart: 7,
            executionOptionsVersion: 2,
            viewVersion: 8,
            inputTargets: Object.freeze([Object.freeze({
                inputTabId: 1,
                inputGeneration: "3:1",
                inputRevision: 4,
                outputTabId: 1,
                outputGeneration: 6,
            })]),
        }),
        provenance = Object.freeze({
            bakeId: 11,
            recipeRevision: 7,
            inputTabId: 1,
            inputGeneration: "3:1",
            inputRevision: 4,
            outputTabId: 1,
            outputGeneration: 6,
            outputVersion: 9,
            executionOptionsVersion: 2,
            terminalState: RUN_STATE.COMPLETED,
        });
    return {
        decision: RUN_DECISION.STARTED,
        terminalState: RUN_STATE.COMPLETED,
        progress: 2,
        stepId: null,
        target,
        provenance,
        rawInput: DATA_CANARIES[0],
        rawOutput: DATA_CANARIES[1],
        nativeError: DATA_CANARIES[2],
        filename: DATA_CANARIES[3],
        ...overrides,
    };
}


/**
 * Executes the protected Bake handler through the shared provider boundary.
 *
 * @param {Object} service - Agent Bake service fixture.
 * @param {Object} [input={expectedRevision: 7}] - Tool input.
 * @returns {Promise<Object>} Final tool result envelope.
 */
async function executeBake(service, input={expectedRevision: 7}) {
    const handler = createBakeRecipeToolHandlers(service)[TOOL_NAME.BAKE_RECIPE],
        session = new CollaborationSession(true, () => 5);
    session.start();
    return await executeTool(
        TOOL_CONTRACTS[TOOL_NAME.BAKE_RECIPE],
        (value, signal) => session.execute(handler, value, signal),
        input
    );
}


TestRegister.addApiTests([
    it("WebMCPBakeRecipeToolHandlers: should return bounded completed provenance", async () => {
        let receivedRevision,
            receivedSignal;
        const result = await executeBake({
                ensureActiveBake: async (expectedRevision, signal) => {
                    receivedRevision = expectedRevision;
                    receivedSignal = signal;
                    return createBakeResult();
                },
            }),
            serialized = JSON.stringify(result);

        assert.equal(receivedRevision, 7);
        assert(receivedSignal instanceof AbortSignal);
        assert.deepStrictEqual(result.data, {
            decision: RUN_DECISION.STARTED,
            progress: 2,
        });
        assert.deepStrictEqual(result.state, {
            sessionEpoch: 5,
            recipeRevision: 7,
            executionCapability: "AGENT_BAKE_AVAILABLE",
            inputTabId: 1,
            inputGeneration: "3:1",
            inputRevision: 4,
            executionOptionsVersion: 2,
            viewVersion: 8,
            outputTabId: 1,
            outputGeneration: 6,
            outputVersion: 9,
            bakeId: 11,
            terminalState: RUN_STATE.COMPLETED,
        });
        for (const canary of DATA_CANARIES) assert.equal(serialized.includes(canary), false);
    }),

    it("WebMCPBakeRecipeToolHandlers: should map every terminal Run state", async () => {
        const cases = [
            [RUN_STATE.PAUSED, TOOL_ERROR_CODE.BAKE_PAUSED],
            [RUN_STATE.FAILED, TOOL_ERROR_CODE.BAKE_FAILED],
            [RUN_STATE.CANCELLED, TOOL_ERROR_CODE.BAKE_CANCELLED],
            [RUN_STATE.TIMED_OUT, TOOL_ERROR_CODE.BAKE_TIMEOUT],
            [RUN_STATE.SUPERSEDED, TOOL_ERROR_CODE.STALE_BAKE_RESULT],
        ];
        for (const [terminalState, errorCode] of cases) {
            const result = await executeBake({
                ensureActiveBake: async () => createBakeResult({
                    terminalState,
                    progress: 1,
                    stepId: "recipe-step-2",
                    provenance: {
                        ...createBakeResult().provenance,
                        terminalState,
                    },
                }),
            });
            assert.equal(result.error.code, errorCode);
            assert.equal(result.error.stepId, "recipe-step-2");
            assert.equal(result.state.terminalState, terminalState);
        }
    }),

    it("WebMCPBakeRecipeToolHandlers: should map fixed pre-Run failures", async () => {
        for (const code of Object.values(AGENT_BAKE_ERROR_CODE)) {
            const result = await executeBake({
                ensureActiveBake: async () => {
                    throw new AgentBakeError(code);
                },
            });
            assert.equal(result.error.code, code);
        }
    }),

    it("WebMCPBakeRecipeToolHandlers: should reject mismatched provenance", async () => {
        const result = await executeBake({
            ensureActiveBake: async () => createBakeResult({
                provenance: {
                    ...createBakeResult().provenance,
                    outputVersion: 10,
                    rawOutput: DATA_CANARIES[1],
                },
                target: {
                    ...createBakeResult().target,
                    bakeId: 12,
                },
            }),
        });

        assert.equal(result.error.code, TOOL_ERROR_CODE.INTERNAL_ERROR);
        assert.equal(JSON.stringify(result).includes(DATA_CANARIES[1]), false);
    }),
]);
