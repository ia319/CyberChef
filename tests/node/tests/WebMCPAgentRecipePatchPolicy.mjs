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
    it("WebMCPAgentRecipePatchPolicy: should supply CyberChef insert defaults", () => {
        const changes = prepareAgentRecipeChanges([
            {type: "insert", operation: "To Hex"},
            {type: "insert", operation: "To Base32"},
            {type: "disable", stepId: "recipe-step-1"},
        ]);

        assert.deepStrictEqual(changes, [
            {type: "insert", operation: "To Hex", arguments: ["Space", 0]},
            {type: "insert", operation: "To Base32", arguments: ["A-Z2-7="]},
            {type: "disable", stepId: "recipe-step-1"},
        ]);
        assert.deepStrictEqual(prepareAgentRecipeChanges([{
            type: "insert",
            operation: "Generate HOTP",
        }]), [{
            type: "insert",
            operation: "Generate HOTP",
            arguments: ["Account", 6, 0],
        }]);
        assert.deepStrictEqual(prepareAgentRecipeChanges([{
            type: "insert",
            operation: "ADD",
        }]), [{
            type: "insert",
            operation: "ADD",
            arguments: [{option: "Hex", string: ""}],
        }]);
    }),

    it("WebMCPAgentRecipePatchPolicy: should reject unknown Operations and invalid arguments", () => {
        assert.throws(
            () => prepareAgentRecipeChanges([{type: "insert", operation: "SECRET_UNKNOWN_OPERATION"}]),
            error => error instanceof RecipeTransactionError &&
                error.code === RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH &&
                !error.message.includes("SECRET_UNKNOWN_OPERATION")
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
        });
        assert.equal(allowed.standardModificationAllowed, true);
        assert.equal(allowed.agentBakeAllowed, true);

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
        });
        assert.equal(reduced.agentBakeAllowed, true);

        const blockedExecution = authorizeAgentRecipePatch({
            steps: [{
                operation: {op: "Register", args: ["([\\s\\S]*)", true, false, false]},
            }],
            actions: [{
                commandIndex: 0,
                type: "remove",
                operationName: "To Base64",
            }],
        });
        assert.equal(blockedExecution.standardModificationAllowed, false);
        assert.equal(blockedExecution.agentBakeAllowed, false);
    }),

    it("WebMCPAgentRecipePatchPolicy: should aggregate a value-free Recipe approval summary", () => {
        const nameCanary = "SECRET_ACCOUNT_CANARY",
            captureCanary = "SECRET_CAPTURE_CANARY",
            approved = authorizeAgentRecipePatch({
                steps: [{
                    operation: {op: "Generate HOTP", args: [nameCanary, 8, 42]},
                }, {
                    operation: {op: "Register", args: [captureCanary, true, false, false]},
                }],
                actions: [{
                    commandIndex: 0,
                    type: "insert",
                    operationName: "Generate HOTP",
                }, {
                    commandIndex: 1,
                    type: "insert",
                    operationName: "Register",
                }],
            }),
            serialized = JSON.stringify(approved);

        assert.equal(approved.approvalRequired, true);
        assert.equal(approved.approvalModificationAllowed, true);
        assert.equal(approved.approvalBakeAllowed, true);
        assert.deepStrictEqual(approved.approvalSummary, {
            operationNames: ["Generate HOTP", "Register"],
            sensitiveParameterNames: [],
            riskFlags: ["secretInput", "sensitiveOutput", "inputDerivedArguments"],
            changeTypes: ["insert"],
        });
        assert.equal(serialized.includes(nameCanary), false);
        assert.equal(serialized.includes(captureCanary), false);
        assert.equal(serialized.includes("42"), false);
    }),

    it("WebMCPAgentRecipePatchPolicy: should reject invalid approval arguments", () => {
        const createPatch = (steps, actionType="insert") => ({
            steps,
            actions: [{
                commandIndex: 0,
                type: actionType,
                operationName: "Generate HOTP",
            }],
        });

        assert.throws(() => authorizeAgentRecipePatch(createPatch([{
            operation: {op: "Generate HOTP", args: ["Account", 9, 0]},
        }])), error => error instanceof RecipeTransactionError &&
            error.code === RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED);
    }),
]);
