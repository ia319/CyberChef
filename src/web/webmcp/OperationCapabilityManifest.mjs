import { OPERATION_CATALOG } from "./OperationCatalog.mjs";
import { OPERATION_PROFILES } from "./OperationProfiles.mjs";
import { isOperationResourceLimits } from "./OperationResourcePolicy.mjs";

const REVIEW_STATUS = Object.freeze({
    SAFE: "safe",
    CONSTRAINED: "constrained",
    DENIED: "denied",
    UNREVIEWED: "unreviewed",
});

const OPERATION_POLICY = Object.freeze({
    ALLOWED: "allowed",
    BLOCKED: "blocked",
    USER_ACTION_REQUIRED: "userActionRequired",
});

const CAPABILITY_FIELDS = Object.freeze([
    "network",
    "remoteResource",
    "externalNavigation",
    "dataToArgument",
    "flowControl",
    "fanOut",
    "regexProbe",
    "highCost",
    "decompression",
    "fileArtifact",
    "htmlPresentation",
    "scriptExecution",
    "pageMutation",
    "nondeterministic",
    "timeDependent",
]);

const FILE_OUTPUT_TYPES = new Set(["File", "List<File>"]);
const CATALOG_DERIVED_CAPABILITY_FIELDS = new Set([
    "flowControl",
    "fileArtifact",
    "htmlPresentation",
]);
const CAPABILITY_FIELD_SET = new Set(CAPABILITY_FIELDS);
const REVIEW_STATUS_SET = new Set(Object.values(REVIEW_STATUS));
const UNREVIEWED_RISK_CODES = Object.freeze(["UNREVIEWED_OPERATION"]);
const NO_EVIDENCE = Object.freeze([]);


/**
 * Creates one blocked policy record with fixed audit evidence.
 *
 * @param {string} operationName - Exact Operation name.
 * @param {string} reviewStatus - Review status for the known risk record.
 * @param {Object} capabilities - Confirmed capability values.
 * @param {string[]} riskCodes - Stable reasons for blocking Agent actions.
 * @param {string[]} evidence - Repository evidence for the decision.
 * @returns {Object} Blocked policy record.
 */
function blockedPolicy(operationName, reviewStatus, capabilities, riskCodes, evidence) {
    return Object.freeze({
        operationName,
        reviewStatus,
        capabilities: Object.freeze({...capabilities}),
        riskCodes: Object.freeze([...riskCodes]),
        evidence: Object.freeze([...evidence]),
        reviewedOn: "2026-08-30",
        sensitiveArguments: null,
        resourceLimits: null,
        mutationPolicy: OPERATION_POLICY.BLOCKED,
        agentBakePolicy: OPERATION_POLICY.BLOCKED,
    });
}

/**
 * Creates one allowed policy from a fully reviewed Operation profile.
 *
 * @param {Object} profile - Reviewed Operation profile.
 * @returns {Object} Allowed policy record.
 */
function allowedPolicy(profile) {
    return Object.freeze({
        operationName: profile.operationName,
        reviewStatus: REVIEW_STATUS.SAFE,
        capabilities: Object.freeze(Object.fromEntries(CAPABILITY_FIELDS
            .filter(field => !CATALOG_DERIVED_CAPABILITY_FIELDS.has(field))
            .map(field => [field, false]))),
        riskCodes: Object.freeze([]),
        evidence: profile.evidence,
        reviewedOn: profile.reviewedOn,
        sensitiveArguments: profile.sensitiveArgumentIndexes,
        resourceLimits: profile.resourceLimits,
        mutationPolicy: OPERATION_POLICY.ALLOWED,
        agentBakePolicy: OPERATION_POLICY.ALLOWED,
    });
}

const DENIED_OPERATION_POLICIES = Object.freeze([
    blockedPolicy("HTTP request", REVIEW_STATUS.DENIED, {
        network: true,
        nondeterministic: true,
    }, ["NETWORK_REQUEST", "INPUT_TO_REQUEST_BODY"], [
        "src/core/operations/HTTPRequest.mjs",
    ]),
    blockedPolicy("DNS over HTTPS", REVIEW_STATUS.DENIED, {
        network: true,
        nondeterministic: true,
    }, ["NETWORK_REQUEST", "INPUT_TO_QUERY"], [
        "src/core/operations/DNSOverHTTPS.mjs",
    ]),
    blockedPolicy("Magic", REVIEW_STATUS.DENIED, {
        fanOut: true,
        highCost: true,
        regexProbe: true,
        scriptExecution: true,
    }, ["FLOW_CONTROL", "ADAPTIVE_PROBE", "SCRIPT_PRESENTATION"], [
        "src/core/operations/Magic.mjs",
        "src/core/lib/Magic.mjs",
    ]),
    blockedPolicy("Parse colour code", REVIEW_STATUS.DENIED, {
        pageMutation: true,
        scriptExecution: true,
    }, ["SCRIPT_PRESENTATION", "PAGE_MUTATION"], [
        "src/core/operations/ParseColourCode.mjs",
    ]),
    blockedPolicy("Render Markdown", REVIEW_STATUS.DENIED, {
        externalNavigation: true,
        remoteResource: true,
    }, ["REMOTE_RESOURCE", "EXTERNAL_NAVIGATION"], [
        "src/core/operations/RenderMarkdown.mjs",
    ]),
    blockedPolicy("Render PDF", REVIEW_STATUS.DENIED, {}, ["EMBEDDED_DOCUMENT"], [
        "src/core/operations/RenderPDF.mjs",
    ]),
    blockedPolicy("Scatter chart", REVIEW_STATUS.DENIED, {
        remoteResource: true,
    }, ["REMOTE_SVG_PAINT"], [
        "src/core/operations/ScatterChart.mjs",
        "src/core/lib/Charts.mjs",
    ]),
    blockedPolicy("Series chart", REVIEW_STATUS.DENIED, {
        remoteResource: true,
    }, ["REMOTE_SVG_PAINT"], [
        "src/core/operations/SeriesChart.mjs",
    ]),
    blockedPolicy("Show on map", REVIEW_STATUS.DENIED, {
        network: true,
        pageMutation: true,
        remoteResource: true,
        scriptExecution: true,
    }, ["NETWORK_REQUEST", "REMOTE_SCRIPT", "PAGE_MUTATION"], [
        "src/core/operations/ShowOnMap.mjs",
    ]),
]);

const KNOWN_RISK_OPERATION_POLICIES = Object.freeze([
    blockedPolicy("Register", REVIEW_STATUS.UNREVIEWED, {
        dataToArgument: true,
        regexProbe: true,
    }, ["DATA_TO_ARGUMENT", "REGEX_PROBE"], [
        "src/core/operations/Register.mjs",
    ]),
    blockedPolicy("Power Set", REVIEW_STATUS.UNREVIEWED, {
        fanOut: true,
        highCost: true,
    }, ["FAN_OUT", "RESOURCE_AMPLIFICATION"], [
        "src/core/operations/PowerSet.mjs",
    ]),
    blockedPolicy("Unzip", REVIEW_STATUS.UNREVIEWED, {
        decompression: true,
        fanOut: true,
    }, ["DECOMPRESSION", "FILE_ARTIFACT", "FAN_OUT"], [
        "src/core/operations/Unzip.mjs",
        "src/core/Utils.mjs",
    ]),
]);

const REVIEWED_OPERATION_POLICIES = Object.freeze([
    ...DENIED_OPERATION_POLICIES,
    ...KNOWN_RISK_OPERATION_POLICIES,
    ...OPERATION_PROFILES.map(allowedPolicy),
]);


/**
 * Creates the deny-by-default capability manifest for one static catalog.
 *
 * @param {Object} catalog - Operation catalog interface.
 * @param {Object[]} reviewedPolicies - Explicit reviewed policy records.
 * @returns {Object} Immutable capability lookup interface.
 */
function createOperationCapabilityManifest(
    catalog=OPERATION_CATALOG,
    reviewedPolicies=REVIEWED_OPERATION_POLICIES
) {
    const reviewedByName = new Map();

    for (const policy of reviewedPolicies) {
        if (!policy || typeof policy.operationName !== "string" ||
            !catalog.getOperation(policy.operationName)) {
            throw new RangeError("Reviewed capability policy references an unknown Operation");
        }
        if (!REVIEW_STATUS_SET.has(policy.reviewStatus) || !policy.capabilities ||
            typeof policy.capabilities !== "object" || Array.isArray(policy.capabilities) ||
            !Array.isArray(policy.riskCodes) || !Array.isArray(policy.evidence) ||
            !(policy.sensitiveArguments === null || Array.isArray(policy.sensitiveArguments)) ||
            !(policy.resourceLimits === null || isOperationResourceLimits(policy.resourceLimits)) ||
            !Object.values(OPERATION_POLICY).includes(policy.mutationPolicy) ||
            !Object.values(OPERATION_POLICY).includes(policy.agentBakePolicy) ||
            policy.riskCodes.some(code => typeof code !== "string") ||
            policy.evidence.some(item => typeof item !== "string") ||
            typeof policy.reviewedOn !== "string") {
            throw new TypeError("Reviewed capability policy has an invalid structure");
        }
        for (const [field, value] of Object.entries(policy.capabilities)) {
            if (!CAPABILITY_FIELD_SET.has(field) || typeof value !== "boolean") {
                throw new TypeError("Reviewed capability policy has an invalid capability");
            }
        }
        if (reviewedByName.has(policy.operationName)) {
            throw new RangeError("Reviewed capability policy contains a duplicate Operation");
        }
        reviewedByName.set(policy.operationName, policy);
    }

    const entries = catalog.getOperationNames().map(operationName => {
            const operation = catalog.getOperation(operationName),
                reviewed = reviewedByName.get(operationName),
                capabilities = Object.fromEntries(CAPABILITY_FIELDS.map(field => [field, null]));

            Object.assign(capabilities, reviewed?.capabilities);
            capabilities.flowControl = operation.flowControl;
            capabilities.fileArtifact = FILE_OUTPUT_TYPES.has(operation.coreOutputType);
            capabilities.htmlPresentation = operation.presentType === "html";

            return Object.freeze({
                operationName,
                reviewStatus: reviewed?.reviewStatus ?? REVIEW_STATUS.UNREVIEWED,
                coreInputType: operation.inputType,
                coreOutputType: operation.coreOutputType,
                presentType: operation.presentType,
                manualBake: operation.manualBake,
                ...capabilities,
                sensitiveArguments: reviewed && Array.isArray(reviewed.sensitiveArguments) ?
                    Object.freeze([...reviewed.sensitiveArguments]) : null,
                resourceLimits: reviewed?.resourceLimits ? Object.freeze({...reviewed.resourceLimits}) : null,
                mutationPolicy: reviewed?.mutationPolicy ?? OPERATION_POLICY.BLOCKED,
                agentBakePolicy: reviewed?.agentBakePolicy ?? OPERATION_POLICY.BLOCKED,
                riskCodes: Object.freeze([...(reviewed?.riskCodes ?? UNREVIEWED_RISK_CODES)]),
                evidence: Object.freeze([...(reviewed?.evidence ?? NO_EVIDENCE)]),
                reviewedOn: reviewed?.reviewedOn ?? null,
            });
        }),
        entriesByName = new Map(entries.map(entry => [entry.operationName, entry])),
        names = Object.freeze(entries.map(entry => entry.operationName));

    /**
     * Returns one exact Operation capability record.
     *
     * @param {string} operationName - Exact Operation name.
     * @returns {Object|null} Immutable capability record or null.
     */
    function getOperationCapability(operationName) {
        return entriesByName.get(operationName) ?? null;
    }

    /**
     * Returns all manifest Operation names in catalog order.
     *
     * @returns {string[]} Immutable Operation name list.
     */
    function getOperationNames() {
        return names;
    }

    return Object.freeze({
        size: entries.length,
        getOperationCapability,
        getOperationNames,
    });
}

const OPERATION_CAPABILITY_MANIFEST = createOperationCapabilityManifest();

export {
    CAPABILITY_FIELDS,
    OPERATION_CAPABILITY_MANIFEST,
    OPERATION_POLICY,
    REVIEWED_OPERATION_POLICIES,
    REVIEW_STATUS,
    createOperationCapabilityManifest,
};
