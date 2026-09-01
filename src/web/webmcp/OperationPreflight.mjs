import {OPERATION_ACCESS} from "./OperationAccessAudit.mjs";
import {resolveOperationArguments} from "./OperationArguments.mjs";
import {OPERATION_CAPABILITY_MANIFEST} from "./OperationCapabilityManifest.mjs";
import {getOperationPermissions} from "./OperationPermissions.mjs";

const OPERATION_PREFLIGHT_VERSION = "2";
const PREFLIGHT_MAX_REPORTED_ISSUES = 64;

const PREFLIGHT_ISSUE_CODE = Object.freeze({
    INVALID_RECIPE: "INVALID_RECIPE",
    UNKNOWN_OPERATION: "UNKNOWN_OPERATION",
    INVALID_ARGUMENTS: "INVALID_ARGUMENTS",
    APPROVAL_OPERATION: "APPROVAL_OPERATION",
    APPROVAL_METADATA_REQUIRED: "APPROVAL_METADATA_REQUIRED",
    BLOCKED_OPERATION: "BLOCKED_OPERATION",
    EXCLUDED_OPERATION: "EXCLUDED_OPERATION",
    UNREVIEWED_OPERATION: "UNREVIEWED_OPERATION",
});


/**
 * Evaluates the complete enabled Recipe against Operation access and core argument rules.
 *
 * @param {Object[]} recipe - Normalized Recipe steps.
 * @returns {Object} Immutable preflight result without argument values.
 */
function preflightOperationRecipe(recipe) {
    const issues = [];
    let issuesTruncated = false,
        recipeValid = Array.isArray(recipe),
        standardModificationAllowed = recipeValid,
        approvalModificationAllowed = recipeValid,
        approvalRequired = false;
    const approvalOperationNames = new Set(),
        approvalSensitiveParameterNames = new Set(),
        approvalRiskFlags = new Set();

    /**
     * Adds one bounded issue without accepting user-controlled text.
     *
     * @param {string} code - Fixed issue code.
     * @param {number|null} stepIndex - Related Recipe step index.
     */
    function addIssue(code, stepIndex=null) {
        if (issues.length >= PREFLIGHT_MAX_REPORTED_ISSUES) {
            issuesTruncated = true;
            return;
        }
        const issue = {code};
        if (stepIndex !== null) issue.stepIndex = stepIndex;
        issues.push(Object.freeze(issue));
    }

    if (!recipeValid) {
        addIssue(PREFLIGHT_ISSUE_CODE.INVALID_RECIPE);
    } else {
        for (let stepIndex = 0; stepIndex < recipe.length; stepIndex++) {
            const step = recipe[stepIndex];
            if (!step || typeof step !== "object" || Array.isArray(step) ||
                typeof step.operationName !== "string") {
                recipeValid = false;
                standardModificationAllowed = false;
                approvalModificationAllowed = false;
                addIssue(PREFLIGHT_ISSUE_CODE.INVALID_RECIPE, stepIndex);
                continue;
            }

            const capability = OPERATION_CAPABILITY_MANIFEST.getOperationCapability(step.operationName),
                permissions = getOperationPermissions(step.operationName),
                enabled = step.disabled !== true;

            if (!capability) {
                recipeValid = false;
                standardModificationAllowed = false;
                approvalModificationAllowed = false;
                addIssue(PREFLIGHT_ISSUE_CODE.UNKNOWN_OPERATION, stepIndex);
                continue;
            }
            if (!enabled) continue;

            switch (permissions.operationAccess) {
                case OPERATION_ACCESS.DIRECT:
                case OPERATION_ACCESS.APPROVAL:
                    break;
                case OPERATION_ACCESS.BLOCKED:
                    standardModificationAllowed = false;
                    approvalModificationAllowed = false;
                    addIssue(PREFLIGHT_ISSUE_CODE.BLOCKED_OPERATION, stepIndex);
                    continue;
                case OPERATION_ACCESS.EXCLUDED:
                    standardModificationAllowed = false;
                    approvalModificationAllowed = false;
                    addIssue(PREFLIGHT_ISSUE_CODE.EXCLUDED_OPERATION, stepIndex);
                    continue;
                default:
                    standardModificationAllowed = false;
                    approvalModificationAllowed = false;
                    addIssue(PREFLIGHT_ISSUE_CODE.UNREVIEWED_OPERATION, stepIndex);
                    continue;
            }

            const argumentResult = resolveOperationArguments(step.operationName, step.arguments);
            if (!argumentResult.valid) {
                recipeValid = false;
                standardModificationAllowed = false;
                approvalModificationAllowed = false;
                addIssue(PREFLIGHT_ISSUE_CODE.INVALID_ARGUMENTS, stepIndex);
                continue;
            }

            if (permissions.operationAccess === OPERATION_ACCESS.APPROVAL) {
                approvalRequired = true;
                standardModificationAllowed = false;
                approvalOperationNames.add(step.operationName);
                addIssue(PREFLIGHT_ISSUE_CODE.APPROVAL_OPERATION, stepIndex);
                if (!capability.approvalSummary) {
                    approvalModificationAllowed = false;
                    addIssue(PREFLIGHT_ISSUE_CODE.APPROVAL_METADATA_REQUIRED, stepIndex);
                    continue;
                }
                for (const name of capability.approvalSummary.sensitiveParameterNames) {
                    approvalSensitiveParameterNames.add(name);
                }
                for (const flag of capability.approvalSummary.riskFlags) {
                    approvalRiskFlags.add(flag);
                }
            }
        }
    }

    const approvalModification = recipeValid && approvalRequired && approvalModificationAllowed;

    return Object.freeze({
        version: OPERATION_PREFLIGHT_VERSION,
        recipeValid,
        standardModificationAllowed: recipeValid && standardModificationAllowed,
        agentBakeAllowed: recipeValid && standardModificationAllowed,
        approvalRequired,
        approvalModificationAllowed: approvalModification,
        approvalBakeAllowed: approvalModification,
        approvalSummary: approvalModification ? Object.freeze({
            operationNames: Object.freeze([...approvalOperationNames]),
            sensitiveParameterNames: Object.freeze([...approvalSensitiveParameterNames]),
            riskFlags: Object.freeze([...approvalRiskFlags]),
        }) : null,
        issues: Object.freeze(issues),
        issuesTruncated,
    });
}


export {
    OPERATION_PREFLIGHT_VERSION,
    PREFLIGHT_ISSUE_CODE,
    PREFLIGHT_MAX_REPORTED_ISSUES,
    preflightOperationRecipe,
};
