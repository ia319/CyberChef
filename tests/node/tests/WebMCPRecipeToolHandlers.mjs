import assert from "assert";
import CollaborationSession from "../../../src/web/webmcp/CollaborationSession.mjs";
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
        });
        assert.equal(serialized.includes(argumentCanary), false);
        assert.equal(serialized.includes("To Base64"), false);
        assert.equal(serialized.includes("From Base64"), false);
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
