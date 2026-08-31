const OPERATION_PROFILE_VERSION = "1";

const PROFILE_ARGUMENT_RULE = Object.freeze({
    BOOLEAN: "boolean",
    CONSTANT: "constant",
    ENUM: "enum",
});

const PROFILE_VALIDATION_CODE = Object.freeze({
    ARGUMENT_COUNT: "ARGUMENT_COUNT",
    ARGUMENT_VALUE: "ARGUMENT_VALUE",
});

const GOLDEN_RECIPE_RESOURCE_LIMITS = Object.freeze({
    maxActiveInputBytes: 256 * 1024,
    maxMaterializedBytes: 4 * 1024 * 1024,
    maxEstimatedWorkBytes: 16 * 1024 * 1024,
    maxSteps: 200,
});

const BASE64_ALPHABETS = Object.freeze([
    "A-Za-z0-9+/=",
    "A-Za-z0-9-_",
]);

const FROM_HEX_DELIMITERS = Object.freeze([
    "Auto",
    "Space",
    "Percent",
    "Comma",
    "Semi-colon",
    "Colon",
    "Line feed",
    "CRLF",
    "0x",
    "0x with comma",
    "\\x",
    "None",
]);

const TO_HEX_DELIMITERS = Object.freeze(FROM_HEX_DELIMITERS.slice(1));


/**
 * Defines an exact string allowlist for one Operation argument.
 *
 * @param {string[]} values - Accepted argument values.
 * @returns {Object} Immutable argument rule.
 */
function enumRule(values) {
    return Object.freeze({
        type: PROFILE_ARGUMENT_RULE.ENUM,
        values: Object.freeze([...values]),
    });
}


/**
 * Defines a boolean Operation argument.
 *
 * @returns {Object} Immutable argument rule.
 */
function booleanRule() {
    return Object.freeze({type: PROFILE_ARGUMENT_RULE.BOOLEAN});
}


/**
 * Defines one exact primitive Operation argument value.
 *
 * @param {string|number|boolean} value - Required argument value.
 * @returns {Object} Immutable argument rule.
 */
function constantRule(value) {
    return Object.freeze({
        type: PROFILE_ARGUMENT_RULE.CONSTANT,
        value,
    });
}


/**
 * Defines a bounded linear Operation resource profile.
 *
 * @param {number} maxExpansionRatio - Conservative output-to-input byte ratio.
 * @returns {Object} Immutable resource limits.
 */
function linearResourceLimits(maxExpansionRatio) {
    return Object.freeze({
        complexity: "linear",
        maxInputBytes: GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes,
        maxOutputBytes: GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes,
        maxExpansionRatio,
    });
}


/**
 * Creates one immutable reviewed Operation profile.
 *
 * @param {string} operationName - Exact Operation name.
 * @param {Object[]} argumentRules - Ordered argument rules.
 * @param {Array} defaultArguments - Exact default argument values.
 * @param {number} maxExpansionRatio - Conservative output-to-input byte ratio.
 * @param {string[]} evidence - Repository evidence for the profile.
 * @returns {Object} Reviewed Operation profile.
 */
function defineOperationProfile(
    operationName,
    argumentRules,
    defaultArguments,
    maxExpansionRatio,
    evidence
) {
    if (argumentRules.length !== defaultArguments.length) {
        throw new RangeError("Operation profile defaults must match its argument rules");
    }

    return Object.freeze({
        version: OPERATION_PROFILE_VERSION,
        operationName,
        argumentRules: Object.freeze([...argumentRules]),
        defaultArguments: Object.freeze([...defaultArguments]),
        resourceLimits: linearResourceLimits(maxExpansionRatio),
        evidence: Object.freeze([...evidence]),
        reviewedOn: "2026-08-30",
    });
}

const GOLDEN_OPERATION_PROFILES = Object.freeze([
    defineOperationProfile("From Base64", [
        enumRule(BASE64_ALPHABETS),
        booleanRule(),
        booleanRule(),
    ], ["A-Za-z0-9+/=", true, false], 1, [
        "src/core/operations/FromBase64.mjs",
        "src/core/lib/Base64.mjs",
        "tests/operations/tests/Base64.mjs",
    ]),
    defineOperationProfile("To Base64", [
        enumRule(BASE64_ALPHABETS),
    ], ["A-Za-z0-9+/="], 4, [
        "src/core/operations/ToBase64.mjs",
        "src/core/lib/Base64.mjs",
        "tests/operations/tests/Base64.mjs",
    ]),
    defineOperationProfile("From Hex", [
        enumRule(FROM_HEX_DELIMITERS),
    ], ["Auto"], 1, [
        "src/core/operations/FromHex.mjs",
        "src/core/lib/Hex.mjs",
        "tests/operations/tests/Hex.mjs",
    ]),
    defineOperationProfile("To Hex", [
        enumRule(TO_HEX_DELIMITERS),
        constantRule(0),
    ], ["Space", 0], 5, [
        "src/core/operations/ToHex.mjs",
        "src/core/lib/Hex.mjs",
        "tests/operations/tests/Hex.mjs",
    ]),
    defineOperationProfile("URL Decode", [
        booleanRule(),
    ], [true], 1, [
        "src/core/operations/URLDecode.mjs",
        "tests/operations/tests/URLEncodeDecode.mjs",
    ]),
    defineOperationProfile("URL Encode", [
        booleanRule(),
    ], [false], 3, [
        "src/core/operations/URLEncode.mjs",
        "tests/operations/tests/URLEncodeDecode.mjs",
    ]),
    defineOperationProfile("ROT13", [
        constantRule(true),
        constantRule(true),
        constantRule(false),
        constantRule(13),
    ], [true, true, false, 13], 1, [
        "src/core/operations/ROT13.mjs",
        "tests/operations/tests/Rotate.mjs",
    ]),
]);

const PROFILES_BY_NAME = new Map(GOLDEN_OPERATION_PROFILES.map(profile => [profile.operationName, profile]));
if (PROFILES_BY_NAME.size !== GOLDEN_OPERATION_PROFILES.length) {
    throw new RangeError("Operation profiles contain a duplicate name");
}


/**
 * Returns one exact reviewed Operation profile.
 *
 * @param {string} operationName - Exact Operation name.
 * @returns {Object|null} Immutable Operation profile or null.
 */
function getOperationProfile(operationName) {
    return PROFILES_BY_NAME.get(operationName) ?? null;
}


/**
 * Validates or supplies the exact arguments accepted by one reviewed profile.
 *
 * @param {Object} profile - Reviewed Operation profile.
 * @param {Array|undefined} argumentsValue - Requested arguments or undefined for defaults.
 * @returns {Object} Fixed validation result and normalized arguments.
 */
function resolveOperationProfileArguments(profile, argumentsValue) {
    const values = typeof argumentsValue === "undefined" ? profile.defaultArguments : argumentsValue;
    if (!Array.isArray(values) || values.length !== profile.argumentRules.length) {
        return Object.freeze({valid: false, code: PROFILE_VALIDATION_CODE.ARGUMENT_COUNT});
    }

    for (let index = 0; index < profile.argumentRules.length; index++) {
        const rule = profile.argumentRules[index],
            value = values[index];
        let valid = false;

        if (rule.type === PROFILE_ARGUMENT_RULE.BOOLEAN) {
            valid = typeof value === "boolean";
        } else if (rule.type === PROFILE_ARGUMENT_RULE.CONSTANT) {
            valid = Object.is(value, rule.value);
        } else if (rule.type === PROFILE_ARGUMENT_RULE.ENUM) {
            valid = rule.values.some(candidate => Object.is(candidate, value));
        }

        if (!valid) return Object.freeze({valid: false, code: PROFILE_VALIDATION_CODE.ARGUMENT_VALUE});
    }

    return Object.freeze({
        valid: true,
        arguments: Object.freeze([...values]),
    });
}

export {
    BASE64_ALPHABETS,
    FROM_HEX_DELIMITERS,
    GOLDEN_OPERATION_PROFILES,
    GOLDEN_RECIPE_RESOURCE_LIMITS,
    OPERATION_PROFILE_VERSION,
    PROFILE_ARGUMENT_RULE,
    PROFILE_VALIDATION_CODE,
    TO_HEX_DELIMITERS,
    getOperationProfile,
    resolveOperationProfileArguments,
};
