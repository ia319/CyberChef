import OperationConfig from "../../core/config/OperationConfig.json" with { type: "json" };
import { DATA_FORMAT_OPERATION_PROFILE_CONFIGS } from "./DataFormatOperationProfiles.mjs";
import {
    PROFILE_VALIDATION_CODE,
    resolveOperationProfileArguments,
} from "./OperationArgumentValidation.mjs";
import {
    PROFILE_ARGUMENT_RULE,
    booleanRule,
    constantRule,
    enumRule,
    isOperationProfileRelation,
    isOperationProfileRule,
    isProfilePrimitive,
} from "./OperationProfileRules.mjs";
import {
    GOLDEN_RECIPE_RESOURCE_LIMITS,
    isOperationResourceLimits,
    linearResourceLimits,
} from "./OperationResourcePolicy.mjs";

const OPERATION_PROFILE_VERSION = "2";

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
 * Checks that every conditional rule references an argument in the same profile.
 *
 * @param {Object} rule - Validated argument rule.
 * @param {number} argumentCount - Number of arguments in the profile.
 * @returns {boolean} Whether all dependency indexes are in range.
 */
function referencesKnownArgument(rule, argumentCount) {
    if (rule.type !== PROFILE_ARGUMENT_RULE.CONDITIONAL) return true;
    return rule.argumentIndex < argumentCount &&
        referencesKnownArgument(rule.matchedRule, argumentCount) &&
        referencesKnownArgument(rule.unmatchedRule, argumentCount);
}


/**
 * Creates one immutable reviewed Operation profile.
 *
 * @param {Object} config - Closed declarative profile configuration.
 * @returns {Object} Reviewed Operation profile.
 */
function defineOperationProfile(config) {
    const properties = [
            "operationName", "argumentRules", "defaultArguments", "argumentRelations",
            "sensitiveArgumentIndexes", "resourceLimits", "evidence", "reviewedOn",
        ],
        prototype = config && typeof config === "object" ? Object.getPrototypeOf(config) : null,
        descriptors = config && typeof config === "object" ? Object.getOwnPropertyDescriptors(config) : {},
        keys = Reflect.ownKeys(descriptors);

    if (!config || (prototype !== Object.prototype && prototype !== null) ||
        keys.length !== properties.length || keys.some(key => typeof key !== "string" ||
            !properties.includes(key) || !descriptors[key].enumerable || !("value" in descriptors[key]))) {
        throw new TypeError("Operation profile must be a closed data record");
    }
    const operationName = config.operationName,
        argumentRules = config.argumentRules,
        defaultArguments = config.defaultArguments,
        argumentRelations = config.argumentRelations,
        sensitiveArgumentIndexes = config.sensitiveArgumentIndexes,
        resourceLimits = config.resourceLimits,
        evidence = config.evidence,
        reviewedOn = config.reviewedOn,
        sourceOperation = Object.prototype.hasOwnProperty.call(OperationConfig, operationName) ?
            OperationConfig[operationName] : null,
        sourceArguments = sourceOperation?.args;

    if (typeof operationName !== "string" || !Array.isArray(sourceArguments) ||
        !Array.isArray(argumentRules) || !Array.isArray(defaultArguments) ||
        argumentRules.length !== sourceArguments.length ||
        defaultArguments.length !== argumentRules.length ||
        argumentRules.some(rule => !isOperationProfileRule(rule)) ||
        defaultArguments.some(value => !isProfilePrimitive(value)) ||
        !Array.isArray(argumentRelations) ||
        argumentRelations.some(relation => !isOperationProfileRelation(relation) ||
            relation.valueArgumentIndex >= argumentRules.length ||
            relation.alphabetArgumentIndex >= argumentRules.length) ||
        !Array.isArray(sensitiveArgumentIndexes) ||
        sensitiveArgumentIndexes.some(index => !Number.isSafeInteger(index) || index < 0 ||
            index >= argumentRules.length) ||
        new Set(sensitiveArgumentIndexes).size !== sensitiveArgumentIndexes.length ||
        !isOperationResourceLimits(resourceLimits) ||
        !Array.isArray(evidence) || evidence.length < 1 ||
        evidence.some(item => typeof item !== "string" || item.length < 1) ||
        typeof reviewedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(reviewedOn)) {
        throw new TypeError("Operation profile configuration is invalid");
    }

    if (argumentRules.some(rule => !referencesKnownArgument(rule, argumentRules.length))) {
        throw new RangeError("Operation profile dependency references an unknown argument");
    }
    if (argumentRelations.some(relation =>
        argumentRules[relation.alphabetArgumentIndex].type !== PROFILE_ARGUMENT_RULE.ALPHABET)) {
        throw new TypeError("Operation profile relation requires an alphabet argument");
    }

    return Object.freeze({
        version: OPERATION_PROFILE_VERSION,
        operationName,
        argumentRules: Object.freeze([...argumentRules]),
        defaultArguments: Object.freeze([...defaultArguments]),
        argumentRelations: Object.freeze([...argumentRelations]),
        sensitiveArgumentIndexes: Object.freeze([...sensitiveArgumentIndexes]),
        resourceLimits,
        evidence: Object.freeze([...evidence]),
        reviewedOn,
    });
}

const GOLDEN_OPERATION_PROFILES = Object.freeze([
    defineOperationProfile({
        operationName: "From Base64",
        argumentRules: [enumRule(BASE64_ALPHABETS), booleanRule(), booleanRule()],
        defaultArguments: ["A-Za-z0-9+/=", true, false],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(1),
        evidence: [
            "src/core/operations/FromBase64.mjs",
            "src/core/lib/Base64.mjs",
            "tests/operations/tests/Base64.mjs",
        ],
        reviewedOn: "2026-08-30",
    }),
    defineOperationProfile({
        operationName: "To Base64",
        argumentRules: [enumRule(BASE64_ALPHABETS)],
        defaultArguments: ["A-Za-z0-9+/="],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(4),
        evidence: [
            "src/core/operations/ToBase64.mjs",
            "src/core/lib/Base64.mjs",
            "tests/operations/tests/Base64.mjs",
        ],
        reviewedOn: "2026-08-30",
    }),
    defineOperationProfile({
        operationName: "From Hex",
        argumentRules: [enumRule(FROM_HEX_DELIMITERS)],
        defaultArguments: ["Auto"],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(1),
        evidence: [
            "src/core/operations/FromHex.mjs",
            "src/core/lib/Hex.mjs",
            "tests/operations/tests/Hex.mjs",
        ],
        reviewedOn: "2026-08-30",
    }),
    defineOperationProfile({
        operationName: "To Hex",
        argumentRules: [enumRule(TO_HEX_DELIMITERS), constantRule(0)],
        defaultArguments: ["Space", 0],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(5),
        evidence: [
            "src/core/operations/ToHex.mjs",
            "src/core/lib/Hex.mjs",
            "tests/operations/tests/Hex.mjs",
        ],
        reviewedOn: "2026-08-30",
    }),
    defineOperationProfile({
        operationName: "URL Decode",
        argumentRules: [booleanRule()],
        defaultArguments: [true],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(1),
        evidence: [
            "src/core/operations/URLDecode.mjs",
            "tests/operations/tests/URLEncodeDecode.mjs",
        ],
        reviewedOn: "2026-08-30",
    }),
    defineOperationProfile({
        operationName: "URL Encode",
        argumentRules: [booleanRule()],
        defaultArguments: [false],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(3),
        evidence: [
            "src/core/operations/URLEncode.mjs",
            "tests/operations/tests/URLEncodeDecode.mjs",
        ],
        reviewedOn: "2026-08-30",
    }),
    defineOperationProfile({
        operationName: "ROT13",
        argumentRules: [constantRule(true), constantRule(true), constantRule(false), constantRule(13)],
        defaultArguments: [true, true, false, 13],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(1),
        evidence: [
            "src/core/operations/ROT13.mjs",
            "tests/operations/tests/Rotate.mjs",
        ],
        reviewedOn: "2026-08-30",
    }),
]);

const DATA_FORMAT_OPERATION_PROFILES = Object.freeze(
    DATA_FORMAT_OPERATION_PROFILE_CONFIGS.map(defineOperationProfile)
);
const OPERATION_PROFILES = Object.freeze([
    ...GOLDEN_OPERATION_PROFILES,
    ...DATA_FORMAT_OPERATION_PROFILES,
]);

const PROFILES_BY_NAME = new Map(OPERATION_PROFILES.map(profile => [profile.operationName, profile]));
if (PROFILES_BY_NAME.size !== OPERATION_PROFILES.length) {
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


export {
    BASE64_ALPHABETS,
    DATA_FORMAT_OPERATION_PROFILES,
    FROM_HEX_DELIMITERS,
    GOLDEN_OPERATION_PROFILES,
    GOLDEN_RECIPE_RESOURCE_LIMITS,
    OPERATION_PROFILE_VERSION,
    OPERATION_PROFILES,
    PROFILE_ARGUMENT_RULE,
    PROFILE_VALIDATION_CODE,
    TO_HEX_DELIMITERS,
    defineOperationProfile,
    getOperationProfile,
    resolveOperationProfileArguments,
};
