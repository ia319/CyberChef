import {
    booleanRule,
    enumRule,
    integerRule,
} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const NUMERIC_SEQUENCE_DELIMITERS = Object.freeze([
    "Space",
    "Comma",
    "Semi-colon",
    "Colon",
    "Line feed",
    "CRLF",
]);

const NUMERIC_INPUT_DELIMITERS = Object.freeze([
    ...NUMERIC_SEQUENCE_DELIMITERS,
    "Auto",
]);

const NUMERIC_DATA_FORMAT_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "To Octal",
        argumentRules: Object.freeze([enumRule(NUMERIC_SEQUENCE_DELIMITERS)]),
        defaultArguments: Object.freeze(["Space"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(5),
        evidence: Object.freeze([
            "src/core/operations/ToOctal.mjs",
            "src/core/lib/Delim.mjs",
            "tests/operations/tests/ByteRepr.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Octal",
        argumentRules: Object.freeze([enumRule(NUMERIC_SEQUENCE_DELIMITERS)]),
        defaultArguments: Object.freeze(["Space"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromOctal.mjs",
            "src/core/lib/Delim.mjs",
            "tests/operations/tests/ByteRepr.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "To Decimal",
        argumentRules: Object.freeze([
            enumRule(NUMERIC_SEQUENCE_DELIMITERS),
            booleanRule(),
        ]),
        defaultArguments: Object.freeze(["Space", false]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(6),
        evidence: Object.freeze([
            "src/core/operations/ToDecimal.mjs",
            "src/core/lib/Delim.mjs",
            "tests/operations/tests/FromDecimal.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Decimal",
        argumentRules: Object.freeze([
            enumRule(NUMERIC_INPUT_DELIMITERS),
            booleanRule(),
        ]),
        defaultArguments: Object.freeze(["Auto", false]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromDecimal.mjs",
            "src/core/lib/Decimal.mjs",
            "tests/operations/tests/FromDecimal.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "To Charcode",
        argumentRules: Object.freeze([
            enumRule(NUMERIC_SEQUENCE_DELIMITERS),
            integerRule(2, 36),
        ]),
        defaultArguments: Object.freeze(["Space", 16]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(23),
        evidence: Object.freeze([
            "src/core/operations/ToCharcode.mjs",
            "src/core/Utils.mjs",
            "tests/operations/tests/ByteRepr.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Charcode",
        argumentRules: Object.freeze([
            enumRule(NUMERIC_SEQUENCE_DELIMITERS),
            integerRule(2, 36),
        ]),
        defaultArguments: Object.freeze(["Space", 16]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromCharcode.mjs",
            "src/core/Utils.mjs",
            "tests/operations/tests/ByteRepr.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    NUMERIC_DATA_FORMAT_OPERATION_PROFILE_CONFIGS,
    NUMERIC_INPUT_DELIMITERS,
    NUMERIC_SEQUENCE_DELIMITERS,
};
