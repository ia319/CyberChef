import {
    booleanRule,
    enumRule,
    integerRule,
} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const ENDIANNESS_DATA_FORMATS = Object.freeze(["Hex", "Raw"]);
const MAX_ENDIANNESS_WORD_BYTES = 256;

const ENDIANNESS_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "Swap endianness",
        argumentRules: Object.freeze([
            enumRule(ENDIANNESS_DATA_FORMATS),
            integerRule(1, MAX_ENDIANNESS_WORD_BYTES),
            booleanRule(),
        ]),
        defaultArguments: Object.freeze(["Hex", 4, true]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(3, 3 * MAX_ENDIANNESS_WORD_BYTES),
        evidence: Object.freeze([
            "src/core/operations/SwapEndianness.mjs",
            "src/core/lib/Hex.mjs",
            "src/core/Utils.mjs",
            "tests/operations/tests/SwapEndianness.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    ENDIANNESS_DATA_FORMATS,
    ENDIANNESS_OPERATION_PROFILE_CONFIGS,
    MAX_ENDIANNESS_WORD_BYTES,
};
