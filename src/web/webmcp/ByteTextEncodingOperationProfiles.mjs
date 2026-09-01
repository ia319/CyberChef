import {
    booleanRule,
    enumRule,
    integerRule,
} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const HEX_CONTENT_CONVERSION_OPTIONS = Object.freeze([
    "Only special chars",
    "Only special chars including spaces",
    "All chars",
]);

const TO_MODHEX_DELIMITERS = Object.freeze([
    "Space",
    "Percent",
    "Comma",
    "Semi-colon",
    "Colon",
    "Line feed",
    "CRLF",
    "None",
]);

const FROM_MODHEX_DELIMITERS = Object.freeze([
    "Auto",
    ...TO_MODHEX_DELIMITERS,
]);

const BYTE_TEXT_ENCODING_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "To Hex Content",
        argumentRules: Object.freeze([
            enumRule(HEX_CONTENT_CONVERSION_OPTIONS),
            booleanRule(),
        ]),
        defaultArguments: Object.freeze(["Only special chars", false]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(4, 2),
        evidence: Object.freeze([
            "src/core/operations/ToHexContent.mjs",
            "src/core/lib/Hex.mjs",
            "tests/operations/tests/HexContent.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Hex Content",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromHexContent.mjs",
            "src/core/lib/Hex.mjs",
            "tests/operations/tests/HexContent.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "To Modhex",
        argumentRules: Object.freeze([
            enumRule(TO_MODHEX_DELIMITERS),
            integerRule(0, 256),
        ]),
        defaultArguments: Object.freeze(["Space", 0]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(5),
        evidence: Object.freeze([
            "src/core/operations/ToModhex.mjs",
            "src/core/lib/Modhex.mjs",
            "tests/operations/tests/Modhex.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Modhex",
        argumentRules: Object.freeze([enumRule(FROM_MODHEX_DELIMITERS)]),
        defaultArguments: Object.freeze(["Auto"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromModhex.mjs",
            "src/core/lib/Modhex.mjs",
            "tests/operations/tests/Modhex.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    BYTE_TEXT_ENCODING_OPERATION_PROFILE_CONFIGS,
    FROM_MODHEX_DELIMITERS,
    HEX_CONTENT_CONVERSION_OPTIONS,
    TO_MODHEX_DELIMITERS,
};
