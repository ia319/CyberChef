import {
    booleanRule,
    conditionalRule,
    constantRule,
    integerRule,
} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const TLV_MAX_INPUT_BYTES = 16 * 1024;

const TLV_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "Parse TLV",
        argumentRules: Object.freeze([
            integerRule(0, 4),
            conditionalRule(2, true, constantRule(1), integerRule(1, 4)),
            booleanRule(),
        ]),
        defaultArguments: Object.freeze([1, 1, false]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(
            56,
            0,
            TLV_MAX_INPUT_BYTES,
            1024 * 1024
        ),
        evidence: Object.freeze([
            "src/core/operations/ParseTLV.mjs",
            "src/core/lib/TLVParser.mjs",
            "tests/operations/tests/ParseTLV.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    TLV_MAX_INPUT_BYTES,
    TLV_OPERATION_PROFILE_CONFIGS,
};
