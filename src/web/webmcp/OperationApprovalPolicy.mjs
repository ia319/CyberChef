import {APPROVAL_RISK_FLAG} from "./ApprovalRisk.mjs";
import {
    OPERATION_ACCESS,
    OPERATION_ACCESS_AUDIT,
} from "./OperationAccessAudit.mjs";

const SIGNING_OPERATION_NAMES = Object.freeze([
    "ECDSA Sign",
    "Flask Session Sign",
    "GOST Sign",
    "JWT Sign",
    "PGP Encrypt and Sign",
    "PGP Sign",
    "RSA Sign",
]);

const KEY_GENERATION_OPERATION_NAMES = Object.freeze([
    "Generate ECDSA Key Pair",
    "Generate PGP Key Pair",
    "Generate RSA Key Pair",
]);

const OTP_OPERATION_NAMES = Object.freeze([
    "Generate HOTP",
    "Generate TOTP",
]);

const NETWORK_OPERATION_NAMES = Object.freeze([
    "HTTP request",
    "DNS over HTTPS",
    "Show on map",
]);

const RICH_CONTENT_OPERATION_NAMES = Object.freeze([
    "Render PDF",
    "Show on map",
    "Show Base64 offsets",
    "DateTime Delta",
    "Parse DateTime",
    "Translate DateTime Format",
    "Diff",
    "Entropy",
    "Frequency distribution",
    "Fuzzy Match",
    "Heatmap chart",
    "Hex Density chart",
    "Index of Coincidence",
    "JSON Beautify",
    "Offset checker",
    "Parse Ethernet frame",
    "Parse IPv4 header",
    "Parse TCP",
    "Parse TLS record",
    "Parse UDP",
    "Syntax highlighter",
    "To Table",
]);

const NONDETERMINISTIC_OPERATION_NAMES = Object.freeze([
    "Get Time",
    "Pseudo-Random Number Generator",
    "Pseudo-Random Prime Generator",
    "Generate UUID",
    "Numberwang",
    "Shuffle",
]);

const FLOW_OPERATION_NAMES = Object.freeze([
    "Comment",
    "Conditional Jump",
    "Fork",
    "Jump",
    "Label",
    "Merge",
    "Return",
    "Subsection",
]);

const approvalOperationNames = OPERATION_ACCESS_AUDIT.getOperationNames()
        .filter(operationName =>
            OPERATION_ACCESS_AUDIT.getOperationAccess(operationName) === OPERATION_ACCESS.APPROVAL
        ),
    riskFlagsByName = new Map(approvalOperationNames.map(operationName => [operationName, new Set()]));


/**
 * Adds fixed disclosure flags to explicitly approved Operation names.
 *
 * @param {string[]} operationNames - Exact reviewed Operation names.
 * @param {string[]} riskFlags - Fixed approval disclosure flags.
 */
function addRiskFlags(operationNames, riskFlags) {
    for (const operationName of operationNames) {
        const flags = riskFlagsByName.get(operationName);
        if (!flags) throw new RangeError("Approval policy references a non-approval Operation");
        for (const flag of riskFlags) flags.add(flag);
    }
}

addRiskFlags(SIGNING_OPERATION_NAMES, [
    APPROVAL_RISK_FLAG.SECRET_INPUT,
    APPROVAL_RISK_FLAG.SENSITIVE_OUTPUT,
]);
addRiskFlags(KEY_GENERATION_OPERATION_NAMES, [
    APPROVAL_RISK_FLAG.SENSITIVE_OUTPUT,
    APPROVAL_RISK_FLAG.RESOURCE_INTENSIVE,
]);
addRiskFlags(OTP_OPERATION_NAMES, [
    APPROVAL_RISK_FLAG.SECRET_INPUT,
    APPROVAL_RISK_FLAG.SENSITIVE_OUTPUT,
]);
addRiskFlags(NETWORK_OPERATION_NAMES, [APPROVAL_RISK_FLAG.NETWORK_ACCESS]);
addRiskFlags(RICH_CONTENT_OPERATION_NAMES, [APPROVAL_RISK_FLAG.RICH_CONTENT]);
addRiskFlags(["Show on map"], [APPROVAL_RISK_FLAG.BROWSER_SIDE_EFFECT]);
addRiskFlags(NONDETERMINISTIC_OPERATION_NAMES, [APPROVAL_RISK_FLAG.NONDETERMINISTIC]);
addRiskFlags(["Pseudo-Random Prime Generator"], [APPROVAL_RISK_FLAG.RESOURCE_INTENSIVE]);
addRiskFlags(FLOW_OPERATION_NAMES, [APPROVAL_RISK_FLAG.RECIPE_FLOW]);
addRiskFlags(["Register"], [APPROVAL_RISK_FLAG.INPUT_DERIVED_ARGUMENTS]);

if ([...riskFlagsByName.values()].some(flags => flags.size === 0)) {
    throw new RangeError("Approval policy does not cover every approval Operation");
}

const summariesByName = new Map([...riskFlagsByName].map(([operationName, riskFlags]) => [
        operationName,
        Object.freeze({
            sensitiveParameterNames: Object.freeze([]),
            riskFlags: Object.freeze([...riskFlags]),
        }),
    ])),
    names = Object.freeze([...summariesByName.keys()]);

const OPERATION_APPROVAL_POLICY = Object.freeze({
    size: names.length,

    /**
     * Returns the fixed value-free disclosure for one approval Operation.
     *
     * @param {string} operationName - Exact Operation name.
     * @returns {Object|null} Immutable approval disclosure or null.
     */
    getOperationSummary(operationName) {
        return summariesByName.get(operationName) ?? null;
    },

    /**
     * Returns every Operation covered by the approval policy.
     *
     * @returns {string[]} Immutable Operation name list.
     */
    getOperationNames() {
        return names;
    },
});

export {
    OPERATION_APPROVAL_POLICY,
};
