import assert from "assert";
import CollaborationSession from "../../../src/web/webmcp/CollaborationSession.mjs";
import {createRecipeToolHandlers} from "../../../src/web/webmcp/RecipeToolHandlers.mjs";
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
        filename: DATA_CANARIES[5],
        error: DATA_CANARIES[6],
    })),
});

const executeRecipeState = async (projection, input, epoch=19) => {
    const recipeWaiter = {
            getReadProjection: () => projection,
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
]);
