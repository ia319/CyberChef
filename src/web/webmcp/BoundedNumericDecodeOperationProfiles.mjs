import {
    booleanRule,
    enumRule,
    integerRule,
} from "./OperationProfileRules.mjs";
import {boundedSuperlinearResourceLimits} from "./OperationResourcePolicy.mjs";

const BCD_ENCODING_SCHEMES = Object.freeze([
    "8 4 2 1",
    "7 4 2 1",
    "4 2 2 1",
    "2 4 2 1",
    "8 4 -2 -1",
    "Excess-3",
    "IBM 8 4 2 1",
]);

const BCD_INPUT_FORMATS = Object.freeze([
    "Nibbles",
    "Bytes",
    "Raw",
]);

const BASE_DECODE_MAX_INPUT_BYTES = 4 * 1024;
const BCD_DECODE_MAX_INPUT_BYTES = 64 * 1024;

const BOUNDED_NUMERIC_DECODE_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "From Base",
        argumentRules: Object.freeze([integerRule(2, 36)]),
        defaultArguments: Object.freeze([36]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            2,
            64,
            BASE_DECODE_MAX_INPUT_BYTES,
            32,
            16 * 1024
        ),
        evidence: Object.freeze([
            "src/core/operations/FromBase.mjs",
            "tests/operations/tests/FromBase.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From BCD",
        argumentRules: Object.freeze([
            enumRule(BCD_ENCODING_SCHEMES),
            booleanRule(),
            booleanRule(),
            enumRule(BCD_INPUT_FORMATS),
        ]),
        defaultArguments: Object.freeze(["8 4 2 1", true, false, "Nibbles"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            2,
            64,
            BCD_DECODE_MAX_INPUT_BYTES,
            1,
            128 * 1024 + 1
        ),
        evidence: Object.freeze([
            "src/core/operations/FromBCD.mjs",
            "src/core/lib/BCD.mjs",
            "tests/operations/tests/BCD.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    BASE_DECODE_MAX_INPUT_BYTES,
    BCD_DECODE_MAX_INPUT_BYTES,
    BCD_ENCODING_SCHEMES,
    BCD_INPUT_FORMATS,
    BOUNDED_NUMERIC_DECODE_OPERATION_PROFILE_CONFIGS,
};
