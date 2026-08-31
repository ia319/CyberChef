import {
    RECIPE_TRANSACTION_ERROR_CODE,
    RecipeTransactionError,
} from "../recipe/RecipeTransaction.mjs";
import {evaluateOperationMutation} from "./OperationPermissions.mjs";
import {preflightOperationRecipe} from "./OperationPreflight.mjs";
import {
    getOperationProfile,
    resolveOperationProfileArguments,
} from "./OperationProfiles.mjs";


/**
 * Supplies reviewed defaults before the generic Recipe patch engine runs.
 *
 * @param {Object[]} changes - Detached schema-validated Agent commands.
 * @returns {Object[]} Commands with complete insert arguments.
 * @throws {RecipeTransactionError} When an insert lacks a reviewed profile or valid arguments.
 */
function prepareAgentRecipeChanges(changes) {
    return changes.map((change, commandIndex) => {
        if (change.type !== "insert") return change;

        const profile = getOperationProfile(change.operation);
        if (!profile) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED, {
                commandIndex,
                policyCode: "PROFILE_REQUIRED",
            });
        }

        const argumentResult = resolveOperationProfileArguments(profile, change.arguments);
        if (!argumentResult.valid) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH, {
                commandIndex,
                patchCode: argumentResult.code,
            });
        }
        return {...change, arguments: argumentResult.arguments};
    });
}


/**
 * Enforces Agent mutation policy against the complete post-change Recipe.
 *
 * @param {Object} patch - Prepared Recipe patch result.
 * @param {number|null} [activeInputBytes=null] - Current active Input byte count.
 * @returns {Object} Complete post-change Recipe preflight result.
 * @throws {RecipeTransactionError} When the complete Recipe or an action is blocked.
 */
function authorizeAgentRecipePatch(patch, activeInputBytes=null) {
    const preflightResult = preflightOperationRecipe(patch.steps.map(step => ({
        operationName: step.operation.op,
        arguments: step.operation.args,
        disabled: step.operation.disabled === true,
    })), activeInputBytes);

    for (const action of patch.actions) {
        const decision = evaluateOperationMutation(action.type, action.operationName, preflightResult);
        if (!decision.allowed) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED, {
                commandIndex: action.commandIndex,
                policyCode: decision.code,
            });
        }
    }
    return preflightResult;
}

const AGENT_RECIPE_PATCH_POLICY = Object.freeze({
    prepareChanges: prepareAgentRecipeChanges,
    authorizePatch: authorizeAgentRecipePatch,
});

export {
    AGENT_RECIPE_PATCH_POLICY,
    authorizeAgentRecipePatch,
    prepareAgentRecipeChanges,
};
