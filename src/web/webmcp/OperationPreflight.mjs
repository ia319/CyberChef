import {
    CAPABILITY_FIELDS,
    OPERATION_CAPABILITY_MANIFEST,
    OPERATION_POLICY,
    REVIEW_STATUS,
} from "./OperationCapabilityManifest.mjs";
import {getOperationPermissions} from "./OperationPermissions.mjs";
import {
    getOperationProfile,
    resolveOperationProfileArguments,
} from "./OperationProfiles.mjs";
import {
    GOLDEN_RECIPE_RESOURCE_LIMITS,
    estimateOperationOutputBytes,
    estimateOperationWorkBytes,
} from "./OperationResourcePolicy.mjs";

const OPERATION_PREFLIGHT_VERSION = "1";
const PREFLIGHT_MAX_REPORTED_ISSUES = 64;
const APPROVAL_OPERATION_STEP_LIMIT = 1;

const PREFLIGHT_ISSUE_CODE = Object.freeze({
    INVALID_RECIPE: "INVALID_RECIPE",
    RECIPE_STEP_LIMIT: "RECIPE_STEP_LIMIT",
    UNKNOWN_OPERATION: "UNKNOWN_OPERATION",
    INVALID_ARGUMENTS: "INVALID_ARGUMENTS",
    PROFILE_REQUIRED: "PROFILE_REQUIRED",
    CONSTRAINED_OPERATION: "CONSTRAINED_OPERATION",
    DENIED_OPERATION: "DENIED_OPERATION",
    UNREVIEWED_OPERATION: "UNREVIEWED_OPERATION",
    ACTIVE_INPUT_LIMIT: "ACTIVE_INPUT_LIMIT",
    STEP_INPUT_LIMIT: "STEP_INPUT_LIMIT",
    STEP_OUTPUT_LIMIT: "STEP_OUTPUT_LIMIT",
    ESTIMATED_WORK_LIMIT: "ESTIMATED_WORK_LIMIT",
    DATA_TO_SINK: "DATA_TO_SINK",
    NETWORK: "NETWORK",
    REMOTE_RESOURCE: "REMOTE_RESOURCE",
    EXTERNAL_NAVIGATION: "EXTERNAL_NAVIGATION",
    DATA_TO_ARGUMENT: "DATA_TO_ARGUMENT",
    FLOW_CONTROL: "FLOW_CONTROL",
    FAN_OUT: "FAN_OUT",
    REGEX_PROBE: "REGEX_PROBE",
    HIGH_COST: "HIGH_COST",
    DECOMPRESSION: "DECOMPRESSION",
    FILE_ARTIFACT: "FILE_ARTIFACT",
    HTML_PRESENTATION: "HTML_PRESENTATION",
    SCRIPT_EXECUTION: "SCRIPT_EXECUTION",
    PAGE_MUTATION: "PAGE_MUTATION",
    NONDETERMINISTIC: "NONDETERMINISTIC",
    TIME_DEPENDENT: "TIME_DEPENDENT",
    APPROVAL_STEP_LIMIT: "APPROVAL_STEP_LIMIT",
});

const CAPABILITY_ISSUE_CODES = Object.freeze({
    network: PREFLIGHT_ISSUE_CODE.NETWORK,
    remoteResource: PREFLIGHT_ISSUE_CODE.REMOTE_RESOURCE,
    externalNavigation: PREFLIGHT_ISSUE_CODE.EXTERNAL_NAVIGATION,
    dataToArgument: PREFLIGHT_ISSUE_CODE.DATA_TO_ARGUMENT,
    flowControl: PREFLIGHT_ISSUE_CODE.FLOW_CONTROL,
    fanOut: PREFLIGHT_ISSUE_CODE.FAN_OUT,
    regexProbe: PREFLIGHT_ISSUE_CODE.REGEX_PROBE,
    highCost: PREFLIGHT_ISSUE_CODE.HIGH_COST,
    decompression: PREFLIGHT_ISSUE_CODE.DECOMPRESSION,
    fileArtifact: PREFLIGHT_ISSUE_CODE.FILE_ARTIFACT,
    htmlPresentation: PREFLIGHT_ISSUE_CODE.HTML_PRESENTATION,
    scriptExecution: PREFLIGHT_ISSUE_CODE.SCRIPT_EXECUTION,
    pageMutation: PREFLIGHT_ISSUE_CODE.PAGE_MUTATION,
    nondeterministic: PREFLIGHT_ISSUE_CODE.NONDETERMINISTIC,
    timeDependent: PREFLIGHT_ISSUE_CODE.TIME_DEPENDENT,
});

const RESOURCE_OVERFLOW_BYTES = GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes + 1;

if (CAPABILITY_FIELDS.some(field => !Object.prototype.hasOwnProperty.call(CAPABILITY_ISSUE_CODES, field))) {
    throw new RangeError("Operation preflight is missing a capability issue code");
}


/**
 * Evaluates the complete enabled Recipe against capability and resource policy.
 *
 * @param {Object[]} recipe - Normalized Recipe steps.
 * @param {number|null} [activeInputBytes=null] - Current active Input byte count.
 * @returns {Object} Immutable preflight result without argument values.
 */
function preflightOperationRecipe(recipe, activeInputBytes=null) {
    if (activeInputBytes !== null && (!Number.isSafeInteger(activeInputBytes) || activeInputBytes < 0)) {
        throw new RangeError("Active Input byte count must be a non-negative safe integer");
    }

    const issues = [],
        steps = [];
    let issuesTruncated = false,
        recipeValid = Array.isArray(recipe),
        standardModificationAllowed = recipeValid,
        approvalModificationAllowed = recipeValid,
        approvalBakePolicyAllowed = recipeValid,
        resourceAllowed = activeInputBytes !== null,
        estimatedBytes = activeInputBytes,
        estimatedWorkBytes = 0,
        dataToArgumentSeen = false,
        approvalStepCount = 0;
    const approvalOperationNames = new Set(),
        approvalSensitiveParameterNames = new Set(),
        approvalRiskFlags = new Set();

    /**
     * Adds one bounded issue without accepting user-controlled text.
     *
     * @param {string} code - Fixed issue code.
     * @param {number|null} stepIndex - Related Recipe step index.
     * @param {string|null} capability - Fixed capability field.
     */
    function addIssue(code, stepIndex=null, capability=null) {
        if (issues.length >= PREFLIGHT_MAX_REPORTED_ISSUES) {
            issuesTruncated = true;
            return;
        }
        const issue = {code};
        if (stepIndex !== null) issue.stepIndex = stepIndex;
        if (capability !== null) issue.capability = capability;
        issues.push(Object.freeze(issue));
    }

    if (!recipeValid) {
        addIssue(PREFLIGHT_ISSUE_CODE.INVALID_RECIPE);
    } else {
        if (recipe.length > GOLDEN_RECIPE_RESOURCE_LIMITS.maxSteps) {
            standardModificationAllowed = false;
            addIssue(PREFLIGHT_ISSUE_CODE.RECIPE_STEP_LIMIT);
        }
        if (activeInputBytes !== null &&
            activeInputBytes > GOLDEN_RECIPE_RESOURCE_LIMITS.maxActiveInputBytes) {
            resourceAllowed = false;
            addIssue(PREFLIGHT_ISSUE_CODE.ACTIVE_INPUT_LIMIT);
        }

        for (let stepIndex = 0; stepIndex < recipe.length; stepIndex++) {
            const step = recipe[stepIndex];
            if (!step || typeof step !== "object" || Array.isArray(step) ||
                typeof step.operationName !== "string") {
                recipeValid = false;
                standardModificationAllowed = false;
                approvalModificationAllowed = false;
                approvalBakePolicyAllowed = false;
                addIssue(PREFLIGHT_ISSUE_CODE.INVALID_RECIPE, stepIndex);
                steps.push(Object.freeze({
                    stepIndex,
                    operationName: null,
                    enabled: false,
                    reviewStatus: null,
                }));
                continue;
            }

            const capability = OPERATION_CAPABILITY_MANIFEST.getOperationCapability(step.operationName),
                permissions = getOperationPermissions(step.operationName),
                enabled = step.disabled !== true;

            steps.push(Object.freeze({
                stepIndex,
                operationName: capability ? step.operationName : null,
                enabled,
                reviewStatus: capability?.reviewStatus ?? null,
                supportedMutationActions: permissions.supportedMutationActions,
                agentBakeAllowed: permissions.agentBakeAllowed,
            }));

            if (!capability) {
                recipeValid = false;
                standardModificationAllowed = false;
                approvalModificationAllowed = false;
                approvalBakePolicyAllowed = false;
                addIssue(PREFLIGHT_ISSUE_CODE.UNKNOWN_OPERATION, stepIndex);
                continue;
            }
            if (!enabled) continue;

            const approvalMutation = capability.reviewStatus === REVIEW_STATUS.CONSTRAINED &&
                    capability.mutationPolicy === OPERATION_POLICY.USER_ACTION_REQUIRED &&
                    capability.approvalSummary,
                approvalBake = approvalMutation &&
                    capability.agentBakePolicy === OPERATION_POLICY.USER_ACTION_REQUIRED;

            if (capability.reviewStatus !== REVIEW_STATUS.SAFE) {
                standardModificationAllowed = false;
                if (!approvalMutation) approvalModificationAllowed = false;
                if (!approvalBake) approvalBakePolicyAllowed = false;
                const statusCode = capability.reviewStatus === REVIEW_STATUS.DENIED ?
                    PREFLIGHT_ISSUE_CODE.DENIED_OPERATION :
                    capability.reviewStatus === REVIEW_STATUS.CONSTRAINED ?
                        PREFLIGHT_ISSUE_CODE.CONSTRAINED_OPERATION :
                        PREFLIGHT_ISSUE_CODE.UNREVIEWED_OPERATION;
                addIssue(statusCode, stepIndex);
            }
            if (approvalMutation) {
                approvalStepCount++;
                approvalOperationNames.add(step.operationName);
                for (const name of capability.approvalSummary.sensitiveParameterNames) {
                    approvalSensitiveParameterNames.add(name);
                }
                for (const flag of capability.approvalSummary.riskFlags) approvalRiskFlags.add(flag);
            }

            for (const field of CAPABILITY_FIELDS) {
                if (capability[field] === true) addIssue(CAPABILITY_ISSUE_CODES[field], stepIndex, field);
            }

            const isExternalSink = capability.network === true || capability.remoteResource === true;
            if (dataToArgumentSeen && isExternalSink) {
                addIssue(PREFLIGHT_ISSUE_CODE.DATA_TO_SINK, stepIndex);
            }
            if (capability.dataToArgument === true) dataToArgumentSeen = true;

            const profile = getOperationProfile(step.operationName);
            if (!profile) {
                if (capability.reviewStatus === REVIEW_STATUS.SAFE) {
                    standardModificationAllowed = false;
                    addIssue(PREFLIGHT_ISSUE_CODE.PROFILE_REQUIRED, stepIndex);
                }
                approvalModificationAllowed = false;
                approvalBakePolicyAllowed = false;
                continue;
            }

            const argumentResult = resolveOperationProfileArguments(profile, step.arguments);
            if (!argumentResult.valid) {
                recipeValid = false;
                standardModificationAllowed = false;
                approvalModificationAllowed = false;
                approvalBakePolicyAllowed = false;
                addIssue(PREFLIGHT_ISSUE_CODE.INVALID_ARGUMENTS, stepIndex);
                continue;
            }

            if (activeInputBytes === null || estimatedBytes === null) continue;
            if (estimatedBytes > profile.resourceLimits.maxInputBytes) {
                resourceAllowed = false;
                addIssue(PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT, stepIndex);
            }

            const estimatedOutputBytes = estimateOperationOutputBytes(profile.resourceLimits, estimatedBytes);
            if (estimatedOutputBytes >= RESOURCE_OVERFLOW_BYTES ||
                estimatedOutputBytes > profile.resourceLimits.maxOutputBytes ||
                estimatedOutputBytes > GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes) {
                resourceAllowed = false;
                addIssue(PREFLIGHT_ISSUE_CODE.STEP_OUTPUT_LIMIT, stepIndex);
            }

            const estimatedStepWorkBytes = estimateOperationWorkBytes(
                profile.resourceLimits,
                estimatedBytes,
                estimatedOutputBytes
            );
            estimatedBytes = estimatedOutputBytes;
            estimatedWorkBytes += estimatedStepWorkBytes;
            if (!Number.isSafeInteger(estimatedWorkBytes) ||
                estimatedWorkBytes > GOLDEN_RECIPE_RESOURCE_LIMITS.maxEstimatedWorkBytes) {
                resourceAllowed = false;
                addIssue(PREFLIGHT_ISSUE_CODE.ESTIMATED_WORK_LIMIT, stepIndex);
            }
        }
    }

    if (approvalStepCount > APPROVAL_OPERATION_STEP_LIMIT) {
        approvalModificationAllowed = false;
        approvalBakePolicyAllowed = false;
        addIssue(PREFLIGHT_ISSUE_CODE.APPROVAL_STEP_LIMIT);
    }

    const resourceChecked = activeInputBytes !== null,
        approvalRequired = approvalStepCount > 0,
        agentBakeAllowed = recipeValid && standardModificationAllowed && resourceChecked && resourceAllowed,
        approvalModification = recipeValid && approvalRequired && approvalModificationAllowed,
        approvalBakeAllowed = approvalModification && approvalBakePolicyAllowed &&
            resourceChecked && resourceAllowed;

    return Object.freeze({
        version: OPERATION_PREFLIGHT_VERSION,
        recipeValid,
        standardModificationAllowed: recipeValid && standardModificationAllowed,
        agentBakeAllowed,
        approvalRequired,
        approvalModificationAllowed: approvalModification,
        approvalBakeAllowed,
        approvalSummary: approvalRequired ? Object.freeze({
            operationNames: Object.freeze([...approvalOperationNames]),
            sensitiveParameterNames: Object.freeze([...approvalSensitiveParameterNames]),
            riskFlags: Object.freeze([...approvalRiskFlags]),
        }) : null,
        resourceChecked,
        resource: Object.freeze({
            activeInputBytes,
            estimatedFinalBytes: resourceChecked ? estimatedBytes : null,
            estimatedWorkBytes: resourceChecked ? estimatedWorkBytes : null,
        }),
        steps: Object.freeze(steps),
        issues: Object.freeze(issues),
        issuesTruncated,
    });
}


export {
    OPERATION_PREFLIGHT_VERSION,
    APPROVAL_OPERATION_STEP_LIMIT,
    PREFLIGHT_ISSUE_CODE,
    PREFLIGHT_MAX_REPORTED_ISSUES,
    preflightOperationRecipe,
};
