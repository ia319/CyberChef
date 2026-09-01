import {enumRule} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const IP_FORMATS = Object.freeze([
    "Dotted Decimal",
    "Decimal",
    "Octal",
    "Hex",
]);

const IP_FORMAT_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "Change IP format",
        argumentRules: Object.freeze([
            enumRule(IP_FORMATS),
            enumRule(IP_FORMATS),
        ]),
        defaultArguments: Object.freeze(["Dotted Decimal", "Hex"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(12),
        evidence: Object.freeze([
            "src/core/operations/ChangeIPFormat.mjs",
            "src/core/lib/Hex.mjs",
            "tests/operations/tests/ChangeIPFormat.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    IP_FORMATS,
    IP_FORMAT_OPERATION_PROFILE_CONFIGS,
};
