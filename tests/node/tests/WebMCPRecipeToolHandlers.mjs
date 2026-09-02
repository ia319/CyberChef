import assert from "assert";
import {
    APPROVAL_MODE,
    APPROVAL_STATE,
    ApprovalCoordinator,
} from "../../../src/web/webmcp/ApprovalCoordinator.mjs";
import CollaborationSession from "../../../src/web/webmcp/CollaborationSession.mjs";
import {
    AGENT_ANALYSIS_ERROR_CODE,
    AgentAnalysisError,
} from "../../../src/web/webmcp/AgentAnalysisError.mjs";
import {createRecipeToolHandlers} from "../../../src/web/webmcp/RecipeToolHandlers.mjs";
import {
    RECIPE_TRANSACTION_ERROR_CODE,
    RECIPE_TRANSACTION_STATUS,
    RecipeTransactionError,
} from "../../../src/web/recipe/RecipeTransaction.mjs";
import {executeTool} from "../../../src/web/webmcp/ToolExecutor.mjs";
import {
    TOOL_CONTRACTS,
    TOOL_NAME,
} from "../../../src/web/webmcp/ToolDefinitions.mjs";
import {
    TOOL_ERROR_CODE,
    TOOL_RESULT_MAX_CHARS,
} from "../../../src/web/webmcp/ToolResult.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const DATA_CANARIES = Object.freeze([
    "SECRET_INPUT_CANARY",
    "SECRET_OUTPUT_CANARY",
    "SECRET_ARGUMENT_CANARY",
    "SECRET_COMMENT_CANARY",
    "SECRET_REGISTER_CANARY",
    "SECRET_FILENAME_CANARY",
    "SECRET_ERROR_CANARY",
    "SECRET_MAGIC_PREVIEW_CANARY",
    "SECRET_CANDIDATE_PARAMETER_CANARY",
]);

const createProjection = (recipeRevision=7, stepCount=2) => ({
    version: "1",
    recipeRevision,
    rawInput: DATA_CANARIES[0],
    rawOutput: DATA_CANARIES[1],
    steps: Array.from({length: stepCount}, (unused, index) => ({
        stepId: `recipe-step-${index + 1}`,
        operationName: index === 1 ? "Comment" : "To Base64",
        disabled: index === 1,
        breakpoint: index === 0,
        argumentStates: [
            {index: 0, configured: true, value: DATA_CANARIES[2]},
        ],
        commentText: DATA_CANARIES[3],
        register: DATA_CANARIES[4],
        magicPreview: DATA_CANARIES[7],
        candidateParameters: [DATA_CANARIES[8]],
        filename: DATA_CANARIES[5],
        error: DATA_CANARIES[6],
    })),
});

const executeRecipeState = async (projection, input, epoch=19) => {
    const recipeWaiter = {
            getReadProjection: () => projection,
            applyAgentPatch: () => {
                throw new Error("Recipe patch is unavailable in this fixture");
            },
        },
        handler = createRecipeToolHandlers(recipeWaiter)[TOOL_NAME.GET_RECIPE_STATE],
        session = new CollaborationSession(true, () => epoch);
    session.start();

    return executeTool(
        TOOL_CONTRACTS[TOOL_NAME.GET_RECIPE_STATE],
        (value, signal) => session.execute(handler, value, signal),
        input
    );
};


/**
 * Creates an approval-aware Recipe handler without visible application state.
 *
 * @returns {Object} Tool executor, approval owner, and mutation evidence.
 */
function createApprovalFixture() {
    let commitCount = 0;
    const approvals = new ApprovalCoordinator({
            idFactory: () => "approval-request-1",
        }),
        workspaceBinding = Object.freeze({
            source: "agent",
            recipeRevisionAtStart: 7,
            inputTargets: Object.freeze([Object.freeze({
                inputTabId: 1,
                inputGeneration: "1:2",
                inputRevision: 3,
                outputTabId: 1,
                outputGeneration: 4,
            })]),
            activeInputTabId: 1,
            activeOutputTabId: 1,
            tabsSynchronized: true,
            viewVersion: 5,
            executionOptionsVersion: 0,
            progress: 0,
            step: false,
        }),
        bakeTarget = Object.freeze({...workspaceBinding, recipeRevisionAtStart: 8}),
        recipeWaiter = {
            getReadProjection: () => createProjection(),
            applyAgentPatch: () => {
                throw new Error("Legacy patch path must remain unused");
            },
            prepareAgentPatch: () => Object.freeze({
                authorization: Object.freeze({
                    approvalRequired: true,
                    approvalSummary: Object.freeze({
                        operationNames: Object.freeze(["Generate HOTP"]),
                        changeTypes: Object.freeze(["insert"]),
                        sensitiveParameterNames: Object.freeze(["Secret"]),
                        riskFlags: Object.freeze(["secretInput"]),
                    }),
                }),
                workspaceBinding,
            }),
            commitAgentPatch: () => {
                throw new Error("Standard patch path must remain unused");
            },
            commitApprovedAgentPatch: (preparedPatch, includeBakeTarget) => {
                commitCount++;
                return {
                    result: {
                        status: RECIPE_TRANSACTION_STATUS.COMMITTED,
                        recipeRevision: 8,
                        insertedSteps: [{commandIndex: 0, stepId: "transaction-step-1"}],
                        change: {
                            actions: [{
                                commandIndex: 0,
                                type: "insert",
                                operationName: "Generate HOTP",
                                stepId: "transaction-step-1",
                            }],
                        },
                    },
                    bakeTarget: includeBakeTarget ? bakeTarget : null,
                };
            },
        },
        handler = createRecipeToolHandlers(
            recipeWaiter,
            null,
            approvals
        )[TOOL_NAME.APPLY_RECIPE_PATCH],
        session = new CollaborationSession(true, () => "session-approval-1");
    session.start();

    return {
        approvals,
        execute: input => executeTool(
            TOOL_CONTRACTS[TOOL_NAME.APPLY_RECIPE_PATCH],
            (value, signal) => session.execute(handler, value, signal),
            input
        ),
        getCommitCount: () => commitCount,
    };
}


TestRegister.addApiTests([
    it("WebMCPRecipeToolHandlers: should include candidate Run state when available", () => {
        const recipeWaiter = {
                getReadProjection: () => createProjection(),
                applyAgentPatch: () => {
                    throw new Error("Recipe patch is unavailable in this fixture");
                },
            },
            runStateService = {
                getActiveState: recipeRevision => ({
                    executionCapability: "AGENT_BAKE_AVAILABLE",
                    inputTabId: 1,
                    outputTabId: 1,
                    outputVersion: recipeRevision,
                }),
            },
            handler = createRecipeToolHandlers(
                recipeWaiter,
                runStateService
            )[TOOL_NAME.GET_RECIPE_STATE],
            result = handler({}, {
                sessionEpoch: 21,
                checkpoint: () => {},
            });

        assert.deepStrictEqual(result.state, {
            sessionEpoch: 21,
            recipeRevision: 7,
            executionCapability: "AGENT_BAKE_AVAILABLE",
            inputTabId: 1,
            outputTabId: 1,
            outputVersion: 7,
        });
    }),

    it("WebMCPRecipeToolHandlers: should return revision-bound redacted Recipe state", async () => {
        const result = await executeRecipeState(createProjection(), {
                expectedRevision: 7,
                offset: 0,
                limit: 2,
            }),
            serialized = JSON.stringify(result);

        assert.equal(result.ok, true);
        assert.deepStrictEqual(result.state, {
            sessionEpoch: 19,
            recipeRevision: 7,
            executionCapability: "USER_BAKE_REQUIRED",
        });
        assert.deepStrictEqual(result.data.steps, [
            {
                stepId: "recipe-step-1",
                operationName: "To Base64",
                enabled: true,
                breakpoint: true,
                argumentStates: [{index: 0, configured: true}],
            },
            {
                stepId: "recipe-step-2",
                operationName: "Comment",
                enabled: false,
                breakpoint: false,
                argumentStates: [{index: 0, configured: true}],
            },
        ]);
        for (const canary of DATA_CANARIES) assert.equal(serialized.includes(canary), false);
    }),

    it("WebMCPRecipeToolHandlers: should paginate large Recipes inside the shared budget", async () => {
        const result = await executeRecipeState(createProjection(9, 50), {
            expectedRevision: 9,
            offset: 0,
            limit: 50,
        });

        assert.equal(result.ok, true);
        assert.equal(result.data.total, 50);
        assert(result.data.steps.length > 0);
        assert(result.data.steps.length < 50);
        assert.equal(result.data.nextOffset, result.data.steps.length);
        assert(JSON.stringify(result).length <= TOOL_RESULT_MAX_CHARS);
    }),

    it("WebMCPRecipeToolHandlers: should reject a stale requested revision without partial state", async () => {
        const result = await executeRecipeState(createProjection(8), {
                expectedRevision: 7,
            }),
            serialized = JSON.stringify(result);

        assert.equal(result.error.code, TOOL_ERROR_CODE.STALE_RECIPE);
        assert.equal(serialized.includes("recipe-step-1"), false);
        for (const canary of DATA_CANARIES) assert.equal(serialized.includes(canary), false);
    }),

    it("WebMCPRecipeToolHandlers: should commit one patch after the invocation checkpoint", () => {
        const argumentCanary = "SECRET_ARGUMENT_CANARY";
        let checkpointCalled = false;
        const recipeWaiter = {
                getReadProjection: () => createProjection(),
                applyAgentPatch: input => {
                    assert.equal(checkpointCalled, true);
                    assert.equal(input.changes[0].value, argumentCanary);
                    return {
                        status: RECIPE_TRANSACTION_STATUS.COMMITTED,
                        recipeRevision: 8,
                        insertedSteps: [{commandIndex: 1, stepId: "transaction-step-1"}],
                        change: {
                            actions: [
                                {
                                    commandIndex: 0,
                                    type: "setArgument",
                                    operationName: "To Base64",
                                    stepId: "recipe-step-1",
                                },
                                {
                                    commandIndex: 1,
                                    type: "insert",
                                    operationName: "From Base64",
                                    stepId: "transaction-step-1",
                                },
                            ],
                        },
                    };
                },
            },
            handler = createRecipeToolHandlers(recipeWaiter)[TOOL_NAME.APPLY_RECIPE_PATCH],
            result = handler({
                expectedRevision: 7,
                changes: [
                    {
                        type: "setArgument",
                        stepId: "recipe-step-1",
                        argumentIndex: 0,
                        value: argumentCanary,
                    },
                    {type: "insert", operation: "From Base64"},
                ],
            }, {
                sessionEpoch: 21,
                checkpoint: () => {
                    checkpointCalled = true;
                },
            }),
            serialized = JSON.stringify(result);

        assert.deepStrictEqual(result.state, {
            sessionEpoch: 21,
            recipeRevision: 8,
            executionCapability: "USER_BAKE_REQUIRED",
        });
        assert.deepStrictEqual(result.data, {
            status: "committed",
            summary: {
                actionCount: 2,
                actionCounts: {setArgument: 1, insert: 1},
            },
            insertedSteps: {
                commandIndexes: [1],
                stepIds: ["transaction-step-1"],
            },
            approvedBakeAvailable: false,
        });
        assert.equal(serialized.includes(argumentCanary), false);
        assert.equal(serialized.includes("To Base64"), false);
        assert.equal(serialized.includes("From Base64"), false);
    }),

    it("WebMCPRecipeToolHandlers: should apply one exact internal Magic candidate", async () => {
        const candidateId = "analysis-candidate-1",
            session = new CollaborationSession(true, () => "candidate-session"),
            analysisService = {
                resolveCandidatePatch: (receivedId, revision, sessionEpoch) => {
                    assert.equal(receivedId, candidateId);
                    assert.equal(revision, 7);
                    assert.equal(sessionEpoch, "candidate-session");
                    return {
                        expectedRevision: revision,
                        changes: [{
                            type: "insert",
                            operation: "From Hex",
                            arguments: [DATA_CANARIES[8]],
                        }],
                    };
                },
            },
            recipeWaiter = {
                getReadProjection: () => createProjection(),
                applyAgentPatch: input => {
                    assert.deepStrictEqual(input, {
                        expectedRevision: 7,
                        changes: [{
                            type: "insert",
                            operation: "From Hex",
                            arguments: [DATA_CANARIES[8]],
                        }],
                    });
                    return {
                        status: RECIPE_TRANSACTION_STATUS.COMMITTED,
                        recipeRevision: 8,
                        insertedSteps: [{commandIndex: 0, stepId: "transaction-step-1"}],
                        change: {
                            actions: [{
                                commandIndex: 0,
                                type: "insert",
                                operationName: "From Hex",
                                stepId: "transaction-step-1",
                            }],
                        },
                    };
                },
            },
            handler = createRecipeToolHandlers(
                recipeWaiter,
                null,
                null,
                analysisService
            )[TOOL_NAME.APPLY_RECIPE_PATCH];
        session.start();

        const result = await executeTool(
                TOOL_CONTRACTS[TOOL_NAME.APPLY_RECIPE_PATCH],
                (value, signal) => session.execute(handler, value, signal),
                {expectedRevision: 7, analysisCandidateId: candidateId}
            ),
            serialized = JSON.stringify(result);

        assert.equal(result.ok, true);
        assert.equal(result.state.recipeRevision, 8);
        assert.equal(serialized.includes(candidateId), false);
        assert.equal(serialized.includes(DATA_CANARIES[8]), false);
    }),

    it("WebMCPRecipeToolHandlers: should reject a stale Magic candidate", async () => {
        const session = new CollaborationSession(true, () => "candidate-session"),
            recipeWaiter = {
                getReadProjection: () => createProjection(),
                applyAgentPatch: () => {
                    throw new Error("Stale candidates must not reach the Recipe transaction");
                },
            },
            analysisService = {
                resolveCandidatePatch: () => {
                    throw new AgentAnalysisError(
                        AGENT_ANALYSIS_ERROR_CODE.STALE_OUTPUT_ANALYSIS
                    );
                },
            },
            handler = createRecipeToolHandlers(
                recipeWaiter,
                null,
                null,
                analysisService
            )[TOOL_NAME.APPLY_RECIPE_PATCH];
        session.start();

        const result = await executeTool(
            TOOL_CONTRACTS[TOOL_NAME.APPLY_RECIPE_PATCH],
            (value, signal) => session.execute(handler, value, signal),
            {expectedRevision: 7, analysisCandidateId: "analysis-candidate-1"}
        );

        assert.equal(result.error.code, TOOL_ERROR_CODE.STALE_OUTPUT_ANALYSIS);
    }),

    it("WebMCPRecipeToolHandlers: should keep the largest patch summary within the result budget", () => {
        const insertedSteps = Array.from({length: 20}, (unused, commandIndex) => ({
                commandIndex,
                stepId: `transaction-step-${Number.MAX_SAFE_INTEGER - commandIndex}`,
            })),
            recipeWaiter = {
                getReadProjection: () => createProjection(),
                applyAgentPatch: () => ({
                    status: RECIPE_TRANSACTION_STATUS.COMMITTED,
                    recipeRevision: Number.MAX_SAFE_INTEGER,
                    insertedSteps,
                    change: {
                        actions: insertedSteps.map(step => ({
                            commandIndex: step.commandIndex,
                            type: "insert",
                            operationName: "To Base64",
                            stepId: step.stepId,
                        })),
                    },
                }),
            },
            handler = createRecipeToolHandlers(recipeWaiter)[TOOL_NAME.APPLY_RECIPE_PATCH],
            result = handler({
                expectedRevision: 7,
                changes: [{type: "insert", operation: "To Base64"}],
            }, {
                sessionEpoch: Number.MAX_SAFE_INTEGER,
                checkpoint: () => {},
            }),
            envelope = {
                version: "1",
                ok: true,
                data: result.data,
                state: result.state,
            };

        assert(JSON.stringify(envelope).length <= TOOL_RESULT_MAX_CHARS);
        assert.equal(result.data.insertedSteps.stepIds.length, 20);
    }),

    it("WebMCPRecipeToolHandlers: should require one exact page approval before mutation", async () => {
        const fixture = createApprovalFixture(),
            input = {
                expectedRevision: 7,
                changes: [{
                    type: "insert",
                    operation: "Generate HOTP",
                    arguments: ["SECRET_ARGUMENT_CANARY", 1, 6, 30, "SHA1"],
                }],
            },
            pending = await fixture.execute(input);

        assert.equal(pending.error.code, TOOL_ERROR_CODE.USER_ACTION_REQUIRED);
        assert.equal(pending.error.approvalRequestId, "approval-request-1");
        assert.equal(pending.state.approvalState, APPROVAL_STATE.PENDING);
        assert.equal(fixture.getCommitCount(), 0);
        assert.equal(JSON.stringify(pending).includes("SECRET_ARGUMENT_CANARY"), false);

        const stillPending = await fixture.execute({
            ...input,
            recipeApprovalRequestId: pending.error.approvalRequestId,
        });
        assert.equal(stillPending.error.code, TOOL_ERROR_CODE.USER_ACTION_REQUIRED);
        assert.equal(stillPending.error.approvalRequestId, pending.error.approvalRequestId);
        assert.equal(fixture.getCommitCount(), 0);

        fixture.approvals.approve(
            pending.error.approvalRequestId,
            "session-approval-1",
            APPROVAL_MODE.RECIPE_ONLY
        );
        const committed = await fixture.execute({
            ...input,
            recipeApprovalRequestId: pending.error.approvalRequestId,
        });
        assert.equal(committed.ok, true);
        assert.equal(committed.data.status, RECIPE_TRANSACTION_STATUS.COMMITTED);
        assert.equal(committed.data.approvedBakeAvailable, false);
        assert.equal(fixture.approvals.getState().state, APPROVAL_STATE.COMPLETE);
        assert.equal(fixture.getCommitCount(), 1);

        const replay = await fixture.execute({
            ...input,
            recipeApprovalRequestId: pending.error.approvalRequestId,
        });
        assert.equal(replay.error.code, TOOL_ERROR_CODE.INVALID_REQUEST);
        assert.equal(fixture.getCommitCount(), 1);
    }),

    it("WebMCPRecipeToolHandlers: should bind an approved Bake and reject changed arguments", async () => {
        const changed = createApprovalFixture(),
            input = {
                expectedRevision: 7,
                changes: [{
                    type: "insert",
                    operation: "Generate HOTP",
                    arguments: ["FIRST_SECRET_CANARY", 1, 6, 30, "SHA1"],
                }],
            },
            pending = await changed.execute(input);
        changed.approvals.approve(
            pending.error.approvalRequestId,
            "session-approval-1",
            APPROVAL_MODE.RECIPE_AND_BAKE
        );
        const mismatch = await changed.execute({
            expectedRevision: 7,
            recipeApprovalRequestId: pending.error.approvalRequestId,
            changes: [{
                ...input.changes[0],
                arguments: ["SECOND_SECRET_CANARY", 1, 6, 30, "SHA1"],
            }],
        });
        assert.equal(mismatch.error.code, TOOL_ERROR_CODE.INVALID_REQUEST);
        assert.equal(changed.getCommitCount(), 0);

        const fixture = createApprovalFixture(),
            bakePending = await fixture.execute(input);
        fixture.approvals.approve(
            bakePending.error.approvalRequestId,
            "session-approval-1",
            APPROVAL_MODE.RECIPE_AND_BAKE
        );
        const committed = await fixture.execute({
            ...input,
            recipeApprovalRequestId: bakePending.error.approvalRequestId,
        });
        assert.equal(committed.ok, true);
        assert.equal(committed.data.approvedBakeAvailable, true);
        assert.equal(fixture.approvals.getState().state, APPROVAL_STATE.BAKE_AVAILABLE);
        assert.equal(fixture.getCommitCount(), 1);
        assert.equal(JSON.stringify(committed).includes("FIRST_SECRET_CANARY"), false);
    }),

    it("WebMCPRecipeToolHandlers: should reject invalid patches before approval state", async () => {
        const fixture = createApprovalFixture(),
            invalid = await fixture.execute({expectedRevision: 7, changes: []});

        assert.equal(invalid.error.code, TOOL_ERROR_CODE.INVALID_REQUEST);
        assert.equal(fixture.approvals.getState().state, APPROVAL_STATE.NONE);
        assert.equal(fixture.getCommitCount(), 0);
    }),

    it("WebMCPRecipeToolHandlers: should preserve a commit failure when settlement fails", async () => {
        let settlementCount = 0;
        const settlementCanary = "SECRET_SETTLEMENT_ERROR_CANARY",
            approvals = {
                requestApproval: async () => {
                    throw new Error("Approval request path must remain unused");
                },
                consumeMutation: async () => ({
                    mode: APPROVAL_MODE.RECIPE_ONLY,
                    signal: new AbortController().signal,
                }),
                completeMutation: async () => {
                    settlementCount++;
                    throw new Error(settlementCanary);
                },
                getState: () => ({state: APPROVAL_STATE.MUTATION_CONSUMED}),
            },
            recipeWaiter = {
                getReadProjection: () => createProjection(),
                applyAgentPatch: () => {
                    throw new Error("Legacy patch path must remain unused");
                },
                prepareAgentPatch: () => Object.freeze({
                    authorization: Object.freeze({
                        approvalRequired: true,
                        approvalSummary: Object.freeze({
                            operationNames: Object.freeze(["Generate HOTP"]),
                            changeTypes: Object.freeze(["insert"]),
                            sensitiveParameterNames: Object.freeze(["Secret"]),
                            riskFlags: Object.freeze(["secretInput"]),
                        }),
                    }),
                    workspaceBinding: Object.freeze({recipeRevisionAtStart: 7}),
                }),
                commitAgentPatch: () => {
                    throw new Error("Standard patch path must remain unused");
                },
                commitApprovedAgentPatch: () => {
                    throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.BAKE_BUSY);
                },
            },
            handler = createRecipeToolHandlers(
                recipeWaiter,
                null,
                approvals
            )[TOOL_NAME.APPLY_RECIPE_PATCH],
            session = new CollaborationSession(true, () => "session-approval-1");
        session.start();

        const result = await executeTool(
            TOOL_CONTRACTS[TOOL_NAME.APPLY_RECIPE_PATCH],
            (value, signal) => session.execute(handler, value, signal),
            {
                expectedRevision: 7,
                recipeApprovalRequestId: "approval-request-1",
                changes: [{type: "insert", operation: "Generate HOTP"}],
            }
        );

        assert.equal(result.error.code, TOOL_ERROR_CODE.BAKE_BUSY);
        assert.equal(settlementCount, 1);
        assert.equal(JSON.stringify(result).includes(settlementCanary), false);
    }),

    it("WebMCPRecipeToolHandlers: should map transaction failures without returning diagnostics", () => {
        const cases = [
            [new RecipeTransactionError(
                RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH,
                {commandIndex: 3, patchCode: "STEP_NOT_FOUND"}
            ), TOOL_ERROR_CODE.UNKNOWN_STEP],
            [new RecipeTransactionError(
                RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED,
                {commandIndex: 1, policyCode: "RECIPE_BLOCKED"}
            ), TOOL_ERROR_CODE.RISK_BLOCKED],
            [new RecipeTransactionError(
                RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE
            ), TOOL_ERROR_CODE.STALE_RECIPE],
            [new Error("SECRET_ERROR_CANARY"), TOOL_ERROR_CODE.INTERNAL_ERROR],
        ];

        for (const [transactionError, expectedCode] of cases) {
            const recipeWaiter = {
                    getReadProjection: () => createProjection(),
                    applyAgentPatch: () => {
                        throw transactionError;
                    },
                },
                handler = createRecipeToolHandlers(recipeWaiter)[TOOL_NAME.APPLY_RECIPE_PATCH];

            assert.throws(() => handler({expectedRevision: 7, changes: []}, {
                sessionEpoch: 21,
                checkpoint: () => {},
            }), error => error.code === expectedCode);
        }
    }),
]);
