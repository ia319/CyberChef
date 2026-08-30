import {ToolExecutionError} from "./ToolExecutor.mjs";
import {TOOL_NAME} from "./ToolDefinitions.mjs";
import {
    TOOL_ERROR_CODE,
    isSuccessResultWithinBudget,
} from "./ToolResult.mjs";

const RECIPE_STATE_DEFAULT_LIMIT = 20;
const USER_BAKE_REQUIRED = "USER_BAKE_REQUIRED";


/**
 * Projects one Recipe step through the workspace disclosure allowlist.
 *
 * @param {Object} step - Redacted Recipe model step.
 * @returns {Object} Public Recipe structure without argument values.
 */
function createRecipeStepState(step) {
    return {
        stepId: step.stepId,
        operationName: step.operationName,
        enabled: step.disabled !== true,
        breakpoint: step.breakpoint === true,
        argumentStates: step.argumentStates.map(argument => ({
            index: argument.index,
            configured: argument.configured === true,
        })),
    };
}


/**
 * Creates Recipe collaboration handlers around the shared Recipe service.
 *
 * @param {Object} recipeWaiter - Recipe state and transaction service.
 * @returns {Object} Handlers keyed by formal tool name.
 */
function createRecipeToolHandlers(recipeWaiter) {
    if (!recipeWaiter || typeof recipeWaiter.getReadProjection !== "function") {
        throw new TypeError("Recipe tool handlers require the Recipe service");
    }

    /**
     * Returns one revision-bound page of redacted visible Recipe structure.
     *
     * @param {Object} input - Schema-validated Recipe state input.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Object} Handler data and Recipe collaboration state.
     */
    function getRecipeState(input, invocation) {
        invocation.checkpoint();
        const projection = recipeWaiter.getReadProjection();
        if (typeof input.expectedRevision !== "undefined" &&
            input.expectedRevision !== projection.recipeRevision) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.STALE_RECIPE);
        }

        const offset = input.offset ?? 0,
            limit = input.limit ?? RECIPE_STATE_DEFAULT_LIMIT,
            requestedSteps = projection.steps
                .slice(offset, offset + limit)
                .map(createRecipeStepState),
            state = {
                sessionEpoch: invocation.sessionEpoch,
                recipeRevision: projection.recipeRevision,
                executionCapability: USER_BAKE_REQUIRED,
            };
        let stepCount = requestedSteps.length,
            data;

        do {
            const steps = requestedSteps.slice(0, stepCount);
            data = {
                steps,
                total: projection.steps.length,
                offset,
                limit,
                nextOffset: offset + steps.length < projection.steps.length ?
                    offset + steps.length : null,
            };
            if (isSuccessResultWithinBudget(data, state)) break;
            stepCount--;
        } while (stepCount >= 0);

        if (stepCount < 0) throw new ToolExecutionError(TOOL_ERROR_CODE.RESULT_TOO_LARGE);
        return {data, state};
    }

    return Object.freeze({
        [TOOL_NAME.GET_RECIPE_STATE]: getRecipeState,
    });
}

export {
    RECIPE_STATE_DEFAULT_LIMIT,
    USER_BAKE_REQUIRED,
    createRecipeToolHandlers,
};
