import assert from "assert";
import {
    GOLDEN_RECIPE_RESOURCE_LIMITS,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
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
    it("WebMCPOperationPreflight: should separate discovery, modification, and Bake permissions", () => {
        assert.deepStrictEqual(getOperationPermissions("To Base64"), {
            discoverable: true,
            operationAccess: "direct",
            reviewStatus: "safe",
            supportedMutationActions: ALL_MUTATION_ACTIONS,
            agentBakeAllowed: true,
            mutationPolicy: "allowed",
            agentBakePolicy: "allowed",
        });
        assert.deepStrictEqual(getOperationPermissions("Generate HOTP"), {
            discoverable: true,
            operationAccess: "approval",
            reviewStatus: "constrained",
            supportedMutationActions: ALL_MUTATION_ACTIONS,
            agentBakeAllowed: false,
            mutationPolicy: "userActionRequired",
            agentBakePolicy: "userActionRequired",
        });
        assert.deepStrictEqual(getOperationPermissions("HTTP request"), {
            discoverable: true,
            operationAccess: "approval",
            reviewStatus: "constrained",
            supportedMutationActions: ALL_MUTATION_ACTIONS,
            agentBakeAllowed: false,
            mutationPolicy: "userActionRequired",
            agentBakePolicy: "userActionRequired",
        });
        assert.deepStrictEqual(getOperationPermissions("Magic"), {
            discoverable: true,
            operationAccess: "blocked",
            reviewStatus: "denied",
            supportedMutationActions: REDUCTION_MUTATION_ACTIONS,
            agentBakeAllowed: false,
            mutationPolicy: "blocked",
            agentBakePolicy: "blocked",
        });
        assert.deepStrictEqual(getOperationPermissions("Automated Validation Test Op"), {
            discoverable: false,
            operationAccess: "excluded",
            reviewStatus: "unreviewed",
            supportedMutationActions: [],
            agentBakeAllowed: false,
            mutationPolicy: "blocked",
            agentBakePolicy: "blocked",
        });
        assert.deepStrictEqual(getOperationPermissions("Reverse"), {
            discoverable: true,
            operationAccess: "direct",
            reviewStatus: "safe",
            supportedMutationActions: ALL_MUTATION_ACTIONS,
            agentBakeAllowed: true,
            mutationPolicy: "allowed",
            agentBakePolicy: "allowed",
        });
        assert.deepStrictEqual(getOperationPermissions("SECRET_OPERATION_CANARY"), {
            discoverable: false,
            operationAccess: "unreviewed",
            reviewStatus: null,
            supportedMutationActions: [],
            agentBakeAllowed: false,
            mutationPolicy: "blocked",
            agentBakePolicy: "blocked",
        });
    }),

    it("WebMCPOperationPreflight: should isolate one technically valid HOTP approval target", () => {
        const hotp = operationStep("Generate HOTP", ["Account", 6, 42]),
            checked = preflightOperationRecipe([hotp], 32),
            unchecked = preflightOperationRecipe([hotp]),
            oversized = preflightOperationRecipe([hotp], 4097),
            repeated = preflightOperationRecipe([hotp, hotp], 32);

        assert.equal(checked.recipeValid, true);
        assert.equal(checked.standardModificationAllowed, false);
        assert.equal(checked.agentBakeAllowed, false);
        assert.equal(checked.approvalRequired, true);
        assert.equal(checked.approvalModificationAllowed, true);
        assert.equal(checked.approvalBakeAllowed, true);
        assert.deepStrictEqual(checked.approvalSummary, {
            operationNames: ["Generate HOTP"],
            sensitiveParameterNames: ["Name"],
            riskFlags: ["secretInput", "sensitiveOutput"],
        });
        assert.equal(unchecked.approvalModificationAllowed, true);
        assert.equal(unchecked.approvalBakeAllowed, false);
        assert.equal(oversized.approvalModificationAllowed, true);
        assert.equal(oversized.approvalBakeAllowed, false);
        assert(issueCodes(oversized).has(PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT));
        assert.equal(repeated.approvalModificationAllowed, false);
        assert.equal(repeated.approvalBakeAllowed, false);
        assert(issueCodes(repeated).has(PREFLIGHT_ISSUE_CODE.APPROVAL_STEP_LIMIT));
    }),

    it("WebMCPOperationPreflight: should approve a complete profiled Recipe after resource checks", () => {
        const recipe = [
                operationStep("From Base64", ["A-Za-z0-9+/=", true, false]),
                operationStep("To Hex", ["Space", 0]),
            ],
            unchecked = preflightOperationRecipe(recipe),
            checked = preflightOperationRecipe(recipe, 1024);

        assert.equal(unchecked.recipeValid, true);
        assert.equal(unchecked.standardModificationAllowed, true);
        assert.equal(unchecked.resourceChecked, false);
        assert.equal(unchecked.agentBakeAllowed, false);
        assert.equal(checked.recipeValid, true);
        assert.equal(checked.standardModificationAllowed, true);
        assert.equal(checked.resourceChecked, true);
        assert.equal(checked.agentBakeAllowed, true);
        assert.deepStrictEqual(checked.issues, []);
        assert.deepStrictEqual(checked.resource, {
            activeInputBytes: 1024,
            estimatedFinalBytes: 5120,
            estimatedWorkBytes: 6144,
        });
    }),

    it("WebMCPOperationPreflight: should reject arguments outside the reviewed profile without echoing values", () => {
        const secret = "SECRET_ARGUMENT_CANARY",
            customAlphabet = preflightOperationRecipe([
                operationStep("From Base64", [secret, true, false]),
            ], 128),
            variableWidthHex = preflightOperationRecipe([
                operationStep("To Hex", ["Space", 4]),
            ], 128);

        assert.equal(customAlphabet.recipeValid, false);
        assert.equal(customAlphabet.standardModificationAllowed, false);
        assert.equal(customAlphabet.agentBakeAllowed, false);
        assert(issueCodes(customAlphabet).has(PREFLIGHT_ISSUE_CODE.INVALID_ARGUMENTS));
        assert.equal(JSON.stringify(customAlphabet).includes(secret), false);
        assert.equal(variableWidthHex.recipeValid, false);
        assert(issueCodes(variableWidthHex).has(PREFLIGHT_ISSUE_CODE.INVALID_ARGUMENTS));
    }),

    it("WebMCPOperationPreflight: should ignore disabled risky steps for the enabled execution chain", () => {
        const disabledRisk = preflightOperationRecipe([
                operationStep("HTTP request", undefined, true),
                operationStep("To Base64"),
            ], 128),
            enabledRisk = preflightOperationRecipe([
                operationStep("HTTP request"),
                operationStep("To Base64"),
            ], 128);

        assert.equal(disabledRisk.standardModificationAllowed, true);
        assert.equal(disabledRisk.agentBakeAllowed, true);
        assert.deepStrictEqual(disabledRisk.issues, []);
        assert.equal(enabledRisk.standardModificationAllowed, false);
        assert.equal(enabledRisk.agentBakeAllowed, false);
        assert(issueCodes(enabledRisk).has(PREFLIGHT_ISSUE_CODE.DENIED_OPERATION));
        assert(issueCodes(enabledRisk).has(PREFLIGHT_ISSUE_CODE.NETWORK));
    }),

    it("WebMCPOperationPreflight: should report representative capability risks for the complete Recipe", () => {
        const cases = [
            ["HTTP request", ["DENIED_OPERATION", "NETWORK"]],
            ["Render Markdown", ["DENIED_OPERATION", "REMOTE_RESOURCE", "HTML_PRESENTATION"]],
            ["Magic", ["DENIED_OPERATION", "FLOW_CONTROL", "SCRIPT_EXECUTION"]],
            ["Unzip", ["UNREVIEWED_OPERATION", "DECOMPRESSION", "FAN_OUT", "FILE_ARTIFACT"]],
            ["Register", ["UNREVIEWED_OPERATION", "DATA_TO_ARGUMENT", "FLOW_CONTROL"]],
            ["Power Set", ["UNREVIEWED_OPERATION", "FAN_OUT", "HIGH_COST"]],
        ];

        for (const [operationName, expectedCodes] of cases) {
            const codes = issueCodes(preflightOperationRecipe([operationStep(operationName)], 128));
            for (const code of expectedCodes) assert(codes.has(code), `${operationName}: ${code}`);
        }
    }),

    it("WebMCPOperationPreflight: should reject a data-to-argument chain before an external sink", () => {
        const result = preflightOperationRecipe([
            operationStep("Register"),
            operationStep("HTTP request"),
        ], 128);

        assert(issueCodes(result).has(PREFLIGHT_ISSUE_CODE.DATA_TO_ARGUMENT));
        assert(issueCodes(result).has(PREFLIGHT_ISSUE_CODE.NETWORK));
        assert(issueCodes(result).has(PREFLIGHT_ISSUE_CODE.DATA_TO_SINK));
        assert.equal(result.agentBakeAllowed, false);
    }),

    it("WebMCPOperationPreflight: should enforce active Input, materialization, work, and step limits", () => {
        const oversizedInput = preflightOperationRecipe([
                operationStep("To Base64"),
            ], GOLDEN_RECIPE_RESOURCE_LIMITS.maxActiveInputBytes + 1),
            amplified = preflightOperationRecipe([
                operationStep("To Hex"),
                operationStep("To Hex"),
            ], GOLDEN_RECIPE_RESOURCE_LIMITS.maxActiveInputBytes),
            highWork = preflightOperationRecipe(
                Array.from({length: 65}, () => operationStep("ROT13")),
                GOLDEN_RECIPE_RESOURCE_LIMITS.maxActiveInputBytes
            ),
            tooManySteps = preflightOperationRecipe(
                Array.from({length: GOLDEN_RECIPE_RESOURCE_LIMITS.maxSteps + 1}, () => operationStep("ROT13"))
            );

        assert.equal(oversizedInput.standardModificationAllowed, true);
        assert.equal(oversizedInput.agentBakeAllowed, false);
        assert(issueCodes(oversizedInput).has(PREFLIGHT_ISSUE_CODE.ACTIVE_INPUT_LIMIT));
        assert.equal(amplified.agentBakeAllowed, false);
        assert(issueCodes(amplified).has(PREFLIGHT_ISSUE_CODE.STEP_OUTPUT_LIMIT));
        assert(Number.isSafeInteger(amplified.resource.estimatedFinalBytes));
        assert.equal(highWork.agentBakeAllowed, false);
        assert(issueCodes(highWork).has(PREFLIGHT_ISSUE_CODE.ESTIMATED_WORK_LIMIT));
        assert.equal(tooManySteps.standardModificationAllowed, false);
        assert(issueCodes(tooManySteps).has(PREFLIGHT_ISSUE_CODE.RECIPE_STEP_LIMIT));
    }),

    it("WebMCPOperationPreflight: should keep unknown names and argument data out of results", () => {
        const operationCanary = "SECRET_OPERATION_CANARY",
            argumentCanary = "SECRET_ARGUMENT_CANARY",
            result = preflightOperationRecipe([
                operationStep(operationCanary, [argumentCanary]),
            ], 128),
            serialized = JSON.stringify(result);

        assert.equal(result.recipeValid, false);
        assert(issueCodes(result).has(PREFLIGHT_ISSUE_CODE.UNKNOWN_OPERATION));
        assert.equal(serialized.includes(operationCanary), false);
        assert.equal(serialized.includes(argumentCanary), false);
        assert.equal(serialized.includes("arguments"), false);
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result.steps), true);
        assert.equal(Object.isFrozen(result.issues), true);
    }),

    it("WebMCPOperationPreflight: should apply action policy to the complete post-change Recipe", () => {
        const safePostflight = preflightOperationRecipe([operationStep("To Base64")]),
            approvalPostflight = preflightOperationRecipe([
                operationStep("Generate HOTP", ["Account", 6, 0]),
            ], 32),
            blockedPostflight = preflightOperationRecipe([operationStep("Register")]),
            invalidPostflight = preflightOperationRecipe([operationStep("SECRET_OPERATION_CANARY")]);

        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.INSERT, "To Base64", safePostflight),
            {allowed: true, code: MUTATION_DECISION_CODE.ALLOWED}
        );
        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.INSERT, "Generate HOTP", approvalPostflight),
            {allowed: true, code: MUTATION_DECISION_CODE.ALLOWED, approvalRequired: true}
        );
        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.MOVE, "To Base64", blockedPostflight),
            {allowed: false, code: MUTATION_DECISION_CODE.RECIPE_BLOCKED}
        );
        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.INSERT, "HTTP request", blockedPostflight),
            {allowed: false, code: MUTATION_DECISION_CODE.RECIPE_BLOCKED}
        );
        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.INSERT, "Magic", blockedPostflight),
            {allowed: false, code: MUTATION_DECISION_CODE.ACTION_BLOCKED}
        );
        for (const action of REDUCTION_MUTATION_ACTIONS) {
            assert.deepStrictEqual(
                evaluateOperationMutation(action, "Register", blockedPostflight),
                {allowed: true, code: MUTATION_DECISION_CODE.ALLOWED}
            );
        }
        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.INSERT, "SECRET_OPERATION_CANARY", safePostflight),
            {allowed: false, code: MUTATION_DECISION_CODE.UNKNOWN_OPERATION}
        );
        assert.deepStrictEqual(
            evaluateOperationMutation(MUTATION_ACTION.INSERT, "To Base64", invalidPostflight),
            {allowed: false, code: MUTATION_DECISION_CODE.INVALID_RECIPE}
        );
        assert.deepStrictEqual(
            evaluateOperationMutation("replace", "To Base64", safePostflight),
            {allowed: false, code: MUTATION_DECISION_CODE.ACTION_BLOCKED}
        );
    }),

    it("WebMCPOperationPreflight: should bound reported issues", () => {
        const result = preflightOperationRecipe(
            Array.from({length: 100}, () => operationStep("HTTP request")),
            128
        );

        assert.equal(result.issues.length, PREFLIGHT_MAX_REPORTED_ISSUES);
        assert.equal(result.issuesTruncated, true);
        assert.doesNotThrow(() => JSON.stringify(result));
    }),

    it("WebMCPOperationPreflight: should reject malformed Recipe and resource inputs", () => {
        const malformedRecipe = preflightOperationRecipe(null),
            malformedStep = preflightOperationRecipe([null]);

        assert.equal(malformedRecipe.recipeValid, false);
        assert(issueCodes(malformedRecipe).has(PREFLIGHT_ISSUE_CODE.INVALID_RECIPE));
        assert.equal(malformedStep.recipeValid, false);
        assert(issueCodes(malformedStep).has(PREFLIGHT_ISSUE_CODE.INVALID_RECIPE));
        assert.throws(() => preflightOperationRecipe([], -1), RangeError);
        assert.throws(() => preflightOperationRecipe([], 1.5), RangeError);
    }),
]);
