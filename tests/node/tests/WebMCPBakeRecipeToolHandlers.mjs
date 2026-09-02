import assert from "assert";
import {RUN_DECISION, RUN_STATE} from "../../../src/web/run/RunCoordinator.mjs";
import {
    APPROVAL_MODE,
    APPROVAL_STATE,
    ApprovalCoordinator,
} from "../../../src/web/webmcp/ApprovalCoordinator.mjs";
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
 * Creates the exact pre-Run target used by a one-use Bake permit.
 *
 * @returns {Object} Content-free target without a Bake identifier.
 */
function createPreparedTarget() {
    const target = {...createBakeResult().target};
    delete target.bakeId;
    return Object.freeze(target);
}


/**
 * Executes the protected Bake handler through the shared provider boundary.
 *
 * @param {Object} service - Agent Bake service fixture.
 * @param {Object} [input={expectedRevision: 7}] - Tool input.
 * @param {ApprovalCoordinator|null} [approvals=null] - Optional approval owner.
 * @param {Object|undefined} [options] - Optional host invocation options.
 * @returns {Promise<Object>} Final tool result envelope.
 */
async function executeBake(service, input={expectedRevision: 7}, approvals=null, options) {
    const handler = createBakeRecipeToolHandlers(service, approvals)[TOOL_NAME.BAKE_RECIPE],
        session = new CollaborationSession(true, () => 5);
    session.start();
    return await executeTool(
        TOOL_CONTRACTS[TOOL_NAME.BAKE_RECIPE],
        (value, signal) => session.execute(handler, value, signal),
        input,
        options
    );
}


/**
 * Grants mutation and one exact Bake slots for a test target.
 *
 * @param {ApprovalCoordinator} approvals - Test approval owner.
 * @param {Object} target - Exact prepared Bake target.
 * @returns {Promise<string>} Opaque approval request identifier.
 */
async function approveBake(approvals, target) {
    const action = Object.freeze({kind: "recipeMutation", expectedRevision: 6}),
        request = await approvals.requestApproval({
            sessionEpoch: 5,
            action,
            summary: {
                operationNames: ["Generate HOTP"],
                changeTypes: ["insert"],
                sensitiveParameterNames: ["Secret"],
                riskFlags: ["secretInput"],
            },
        });
    approvals.approve(request.requestId, 5, APPROVAL_MODE.RECIPE_AND_BAKE);
    await approvals.consumeMutation({requestId: request.requestId, sessionEpoch: 5, action});
    await approvals.completeMutation({
        requestId: request.requestId,
        sessionEpoch: 5,
        succeeded: true,
        bakeTarget: target,
    });
    return request.requestId;
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

    it("WebMCPBakeRecipeToolHandlers: should consume one exact approved Bake", async () => {
        const approvals = new ApprovalCoordinator({
                idFactory: () => "approval-request-1",
            }),
            target = createPreparedTarget(),
            requestId = await approveBake(approvals, target);
        let prepareCount = 0,
            commitCount = 0,
            receivedApprovalMode = false;
        const service = {
                ensureActiveBake: async () => {
                    throw new Error("Standard Bake path must remain unused");
                },
                prepareActiveBake: async (expectedRevision, signal, userApproval) => {
                    prepareCount++;
                    assert.equal(expectedRevision, 7);
                    assert(signal instanceof AbortSignal);
                    receivedApprovalMode = userApproval;
                    return Object.freeze({target});
                },
                commitPreparedBake: async (preparedBake, signal) => {
                    commitCount++;
                    assert.strictEqual(preparedBake.target, target);
                    assert(signal instanceof AbortSignal);
                    assert.equal(signal.aborted, false);
                    return createBakeResult();
                },
            },
            result = await executeBake(service, {
                expectedRevision: 7,
                bakeApprovalRequestId: requestId,
            }, approvals);

        assert.equal(result.ok, true);
        assert.equal(prepareCount, 1);
        assert.equal(commitCount, 1);
        assert.equal(receivedApprovalMode, true);
        assert.equal(approvals.getState().state, APPROVAL_STATE.COMPLETE);

        const replay = await executeBake(service, {
            expectedRevision: 7,
            bakeApprovalRequestId: requestId,
        }, approvals);
        assert.equal(replay.error.code, TOOL_ERROR_CODE.INVALID_REQUEST);
        assert.equal(commitCount, 1);
    }),

    it("WebMCPBakeRecipeToolHandlers: should reject a substituted approved target", async () => {
        const approvals = new ApprovalCoordinator({
                idFactory: () => "approval-request-1",
            }),
            target = createPreparedTarget(),
            requestId = await approveBake(approvals, target);
        let commitCount = 0;
        const result = await executeBake({
            ensureActiveBake: async () => {
                throw new Error("Standard Bake path must remain unused");
            },
            prepareActiveBake: async () => Object.freeze({
                target: Object.freeze({...target, activeOutputTabId: 2}),
            }),
            commitPreparedBake: async () => {
                commitCount++;
                return createBakeResult();
            },
        }, {
            expectedRevision: 7,
            bakeApprovalRequestId: requestId,
        }, approvals);

        assert.equal(result.error.code, TOOL_ERROR_CODE.INVALID_REQUEST);
        assert.equal(commitCount, 0);
        assert.equal(approvals.getState().state, APPROVAL_STATE.BAKE_AVAILABLE);
    }),

    it("WebMCPBakeRecipeToolHandlers: should settle a failed approved Bake", async () => {
        const approvals = new ApprovalCoordinator({
                idFactory: () => "approval-request-1",
            }),
            target = createPreparedTarget(),
            requestId = await approveBake(approvals, target),
            failed = createBakeResult({
                terminalState: RUN_STATE.FAILED,
                progress: 1,
                stepId: "recipe-step-2",
                provenance: {
                    ...createBakeResult().provenance,
                    terminalState: RUN_STATE.FAILED,
                },
            }),
            result = await executeBake({
                ensureActiveBake: async () => {
                    throw new Error("Standard Bake path must remain unused");
                },
                prepareActiveBake: async () => Object.freeze({target}),
                commitPreparedBake: async () => failed,
            }, {
                expectedRevision: 7,
                bakeApprovalRequestId: requestId,
            }, approvals);

        assert.equal(result.error.code, TOOL_ERROR_CODE.BAKE_FAILED);
        assert.equal(approvals.getState().state, APPROVAL_STATE.CANCELLED);
        assert.equal(JSON.stringify(result).includes(DATA_CANARIES[1]), false);
    }),

    it("WebMCPBakeRecipeToolHandlers: should settle approval after invocation cancellation", async () => {
        let requestNumber = 0,
            commitCount = 0;
        const approvals = new ApprovalCoordinator({
                idFactory: () => `approval-request-${++requestNumber}`,
            }),
            target = createPreparedTarget(),
            requestId = await approveBake(approvals, target),
            invocationController = new AbortController(),
            approvalBoundary = {
                consumeBake: async options => {
                    const permit = await approvals.consumeBake(options);
                    invocationController.abort(new DOMException("Invocation cancelled", "AbortError"));
                    return permit;
                },
                completeBake: (...args) => approvals.completeBake(...args),
                getState: () => approvals.getState(),
            },
            service = {
                ensureActiveBake: async () => {
                    throw new Error("Standard Bake path must remain unused");
                },
                prepareActiveBake: async () => Object.freeze({target}),
                commitPreparedBake: async () => {
                    commitCount++;
                    return createBakeResult();
                },
            };

        await assert.rejects(
            executeBake(service, {
                expectedRevision: 7,
                bakeApprovalRequestId: requestId,
            }, approvalBoundary, {signal: invocationController.signal}),
            error => error instanceof DOMException && error.name === "AbortError"
        );
        assert.equal(commitCount, 0);
        assert.equal(approvals.getState().state, APPROVAL_STATE.CANCELLED);

        const next = await approvals.requestApproval({
            sessionEpoch: 5,
            action: {kind: "recipeMutation", expectedRevision: 7},
            summary: {
                operationNames: ["Generate HOTP"],
                changeTypes: ["insert"],
                sensitiveParameterNames: ["Secret"],
                riskFlags: ["secretInput"],
            },
        });
        assert.equal(next.requestId, "approval-request-2");
        assert.equal(next.state, APPROVAL_STATE.PENDING);
    }),

    it("WebMCPBakeRecipeToolHandlers: should preserve approved pre-Run failures", async () => {
        const approvals = new ApprovalCoordinator({
                idFactory: () => "approval-request-1",
            }),
            target = createPreparedTarget(),
            requestId = await approveBake(approvals, target),
            result = await executeBake({
                ensureActiveBake: async () => {
                    throw new Error("Standard Bake path must remain unused");
                },
                prepareActiveBake: async () => Object.freeze({target}),
                commitPreparedBake: async () => {
                    throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.BAKE_BUSY);
                },
            }, {
                expectedRevision: 7,
                bakeApprovalRequestId: requestId,
            }, approvals);

        assert.equal(result.error.code, TOOL_ERROR_CODE.BAKE_BUSY);
        assert.equal(approvals.getState().state, APPROVAL_STATE.CANCELLED);
    }),
]);
