import assert from "assert";
import {
    RECIPE_TRANSACTION_ERROR_CODE,
    RecipeTransactionError,
} from "../../../src/web/recipe/RecipeTransaction.mjs";
import {
    authorizeAgentRecipePatch,
    prepareAgentRecipeChanges,
} from "../../../src/web/webmcp/AgentRecipePatchPolicy.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPAgentRecipePatchPolicy: should supply reviewed insert defaults", () => {
        const changes = prepareAgentRecipeChanges([
            {type: "insert", operation: "To Hex"},
            {type: "disable", stepId: "recipe-step-1"},
        ]);

        assert.deepStrictEqual(changes, [
            {type: "insert", operation: "To Hex", arguments: ["Space", 0]},
            {type: "disable", stepId: "recipe-step-1"},
        ]);
    }),

    it("WebMCPAgentRecipePatchPolicy: should reject missing profiles and invalid arguments", () => {
        assert.throws(
            () => prepareAgentRecipeChanges([{type: "insert", operation: "Register"}]),
            error => error instanceof RecipeTransactionError &&
                error.code === RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED &&
                error.policyCode === "PROFILE_REQUIRED"
        );
        assert.throws(
            () => prepareAgentRecipeChanges([{
                type: "insert",
                operation: "To Hex",
                arguments: ["SECRET_INVALID_DELIMITER", 0],
            }]),
            error => error instanceof RecipeTransactionError &&
                error.code === RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH &&
                !error.message.includes("SECRET_INVALID_DELIMITER")
        );
    }),

    it("WebMCPAgentRecipePatchPolicy: should authorize the complete post-change Recipe", () => {
        const allowed = authorizeAgentRecipePatch({
            steps: [{
                operation: {op: "To Base64", args: ["A-Za-z0-9+/="]},
            }],
            actions: [{
                commandIndex: 0,
                type: "insert",
                operationName: "To Base64",
            }],
        }, 32);
        assert.equal(allowed.standardModificationAllowed, true);
        assert.equal(allowed.agentBakeAllowed, true);

        const resourceUnchecked = authorizeAgentRecipePatch({
            steps: [{
                operation: {op: "To Base64", args: ["A-Za-z0-9+/="]},
            }],
            actions: [{
                commandIndex: 0,
                type: "insert",
                operationName: "To Base64",
            }],
        });
        assert.equal(resourceUnchecked.standardModificationAllowed, true);
        assert.equal(resourceUnchecked.agentBakeAllowed, false);

        assert.throws(() => authorizeAgentRecipePatch({
            steps: [{
                operation: {op: "Register", args: ["R0", "{0}"]},
            }],
            actions: [{
                commandIndex: 0,
                type: "enable",
                operationName: "Register",
            }],
        }), error => error instanceof RecipeTransactionError &&
            error.code === RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED &&
            error.commandIndex === 0);

        const reduced = authorizeAgentRecipePatch({
            steps: [{
                operation: {op: "To Base64", args: ["A-Za-z0-9+/="]},
            }],
            actions: [{
                commandIndex: 0,
                type: "remove",
                operationName: "Register",
            }],
        }, 32);
        assert.equal(reduced.agentBakeAllowed, true);

        const blockedExecution = authorizeAgentRecipePatch({
            steps: [{
                operation: {op: "Register", args: ["R0", "{0}"]},
            }],
            actions: [{
                commandIndex: 0,
                type: "remove",
                operationName: "To Base64",
            }],
        }, 32);
        assert.equal(blockedExecution.standardModificationAllowed, false);
        assert.equal(blockedExecution.agentBakeAllowed, false);
    }),
]);
