import assert from "assert";
import {
    MUTATION_ACTION,
    MUTATION_DECISION_CODE,
    evaluateOperationMutation,
    getOperationPermissions,
} from "../../../src/web/webmcp/OperationPermissions.mjs";
import {
    PREFLIGHT_ISSUE_CODE,
    PREFLIGHT_MAX_REPORTED_ISSUES,
    preflightOperationRecipe,
} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const ALL_MUTATION_ACTIONS = Object.freeze(Object.values(MUTATION_ACTION));
const REDUCTION_MUTATION_ACTIONS = Object.freeze([
    MUTATION_ACTION.REMOVE,
    MUTATION_ACTION.DISABLE,
]);

const operationStep = (operationName, argumentsValue=undefined, disabled=false) => {
    const step = {operationName, disabled};
    if (typeof argumentsValue !== "undefined") step.arguments = argumentsValue;
    return step;
};

const issueCodes = result => new Set(result.issues.map(issue => issue.code));


TestRegister.addApiTests([
    it("WebMCPOperationPreflight: should map each access class to its permissions", () => {
        assert.deepStrictEqual(getOperationPermissions("To Base64"), {
            discoverable: true,
            operationAccess: "direct",
            supportedMutationActions: ALL_MUTATION_ACTIONS,
            agentBakeAllowed: true,
            mutationPolicy: "allowed",
            agentBakePolicy: "allowed",
        });
        assert.deepStrictEqual(getOperationPermissions("HTTP request"), {
            discoverable: true,
            operationAccess: "approval",
            supportedMutationActions: ALL_MUTATION_ACTIONS,
            agentBakeAllowed: false,
            mutationPolicy: "userActionRequired",
            agentBakePolicy: "userActionRequired",
        });
        assert.deepStrictEqual(getOperationPermissions("Magic"), {
            discoverable: true,
            operationAccess: "blocked",
            supportedMutationActions: REDUCTION_MUTATION_ACTIONS,
            agentBakeAllowed: false,
            mutationPolicy: "blocked",
            agentBakePolicy: "blocked",
        });
        assert.deepStrictEqual(getOperationPermissions("Automated Validation Test Op"), {
            discoverable: false,
            operationAccess: "excluded",
            supportedMutationActions: [],
            agentBakeAllowed: false,
            mutationPolicy: "blocked",
            agentBakePolicy: "blocked",
        });
        assert.equal(getOperationPermissions("SECRET_OPERATION_CANARY").operationAccess, "unreviewed");
    }),

    it("WebMCPOperationPreflight: should use core arguments without WebMCP resource gates", () => {
        const direct = preflightOperationRecipe([
                operationStep("From Base64", ["CUSTOM_ALPHABET", true, false]),
                operationStep("To Hex", ["Space", 4096]),
                operationStep("Unzip"),
            ]),
            invalid = preflightOperationRecipe([
                operationStep("To Hex", ["SECRET_DELIMITER", 0]),
            ]);

        assert.equal(direct.recipeValid, true);
        assert.equal(direct.standardModificationAllowed, true);
        assert.equal(direct.agentBakeAllowed, true);
        assert.deepStrictEqual(direct.issues, []);
        assert.equal(invalid.recipeValid, false);
        assert(issueCodes(invalid).has(PREFLIGHT_ISSUE_CODE.INVALID_ARGUMENTS));
        assert.equal(JSON.stringify(invalid).includes("SECRET_DELIMITER"), false);
    }),

    it("WebMCPOperationPreflight: should authorize complete Recipes by access class", () => {
        const approval = preflightOperationRecipe([
                operationStep("HTTP request"),
                operationStep("Render PDF"),
                operationStep("Register", ["SECRET_CAPTURE_CANARY", true, false, false]),
            ]),
            disabledBlocked = preflightOperationRecipe([
                operationStep("Magic", undefined, true),
                operationStep("To Base64"),
            ]),
            blocked = preflightOperationRecipe([operationStep("Magic")]),
            excluded = preflightOperationRecipe([operationStep("Automated Validation Test Op")]);

        assert.equal(approval.approvalModificationAllowed, true);
        assert.equal(approval.approvalBakeAllowed, true);
        assert.deepStrictEqual(approval.approvalSummary.operationNames, [
            "HTTP request",
            "Render PDF",
            "Register",
        ]);
        assert.deepStrictEqual(approval.approvalSummary.riskFlags, [
            "networkAccess",
            "richContent",
            "inputDerivedArguments",
        ]);
        assert.equal(JSON.stringify(approval).includes("SECRET_CAPTURE_CANARY"), false);
        assert.equal(disabledBlocked.agentBakeAllowed, true);
        assert.deepStrictEqual(disabledBlocked.issues, []);
        assert(issueCodes(blocked).has(PREFLIGHT_ISSUE_CODE.BLOCKED_OPERATION));
        assert(issueCodes(excluded).has(PREFLIGHT_ISSUE_CODE.EXCLUDED_OPERATION));
    }),

    it("WebMCPOperationPreflight: should apply complete-Recipe policy with bounded results", () => {
        const direct = preflightOperationRecipe([operationStep("To Base64")]),
            approval = preflightOperationRecipe([
                operationStep("Generate HOTP", ["Account", 6, 0]),
            ]),
            blocked = preflightOperationRecipe([operationStep("Magic")]),
            unknown = preflightOperationRecipe([operationStep("SECRET_OPERATION_CANARY")]),
            repeated = preflightOperationRecipe(
                Array.from({length: 100}, () => operationStep("Magic"))
            );

        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.INSERT, "To Base64", direct),
            {allowed: true, code: MUTATION_DECISION_CODE.ALLOWED}
        );
        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.INSERT, "Generate HOTP", approval),
            {allowed: true, code: MUTATION_DECISION_CODE.ALLOWED, approvalRequired: true}
        );
        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.INSERT, "Magic", blocked),
            {allowed: false, code: MUTATION_DECISION_CODE.ACTION_BLOCKED}
        );
        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.REMOVE, "Magic", blocked),
            {allowed: true, code: MUTATION_DECISION_CODE.ALLOWED}
        );
        assert.equal(unknown.recipeValid, false);
        assert.equal(JSON.stringify(unknown).includes("SECRET_OPERATION_CANARY"), false);
        assert.equal(repeated.issues.length, PREFLIGHT_MAX_REPORTED_ISSUES);
        assert.equal(repeated.issuesTruncated, true);
        assert.equal(preflightOperationRecipe(null).recipeValid, false);
        assert.equal(preflightOperationRecipe([null]).recipeValid, false);
    }),
]);
