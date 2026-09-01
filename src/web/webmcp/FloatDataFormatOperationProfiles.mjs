import {enumRule} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const FLOAT_ENDIANNESS_OPTIONS = Object.freeze([
    "Big Endian",
    "Little Endian",
]);

const FLOAT_SIZE_OPTIONS = Object.freeze([
    "Float (4 bytes)",
    "Double (8 bytes)",
]);

const FLOAT_DELIMITERS = Object.freeze([
    "Space",
    "Comma",
    "Semi-colon",
    "Colon",
    "Line feed",
    "CRLF",
]);

const FLOAT_ARGUMENT_RULES = Object.freeze([
    enumRule(FLOAT_ENDIANNESS_OPTIONS),
    enumRule(FLOAT_SIZE_OPTIONS),
    enumRule(FLOAT_DELIMITERS),
]);

const FLOAT_DEFAULT_ARGUMENTS = Object.freeze([
    "Big Endian",
    "Float (4 bytes)",
    "Space",
]);

const FLOAT_DATA_FORMAT_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "To Float",
        argumentRules: FLOAT_ARGUMENT_RULES,
        defaultArguments: FLOAT_DEFAULT_ARGUMENTS,
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(8),
        evidence: Object.freeze([
            "src/core/operations/ToFloat.mjs",
            "tests/operations/tests/Float.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Float",
        argumentRules: FLOAT_ARGUMENT_RULES,
        defaultArguments: FLOAT_DEFAULT_ARGUMENTS,
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(8),
        evidence: Object.freeze([
            "src/core/operations/FromFloat.mjs",
            "tests/operations/tests/Float.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    FLOAT_ARGUMENT_RULES,
    FLOAT_DATA_FORMAT_OPERATION_PROFILE_CONFIGS,
    FLOAT_DEFAULT_ARGUMENTS,
    FLOAT_DELIMITERS,
    FLOAT_ENDIANNESS_OPTIONS,
    FLOAT_SIZE_OPTIONS,
};
