import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const PEM_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "PEM to Hex",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(2),
        evidence: Object.freeze([
            "src/core/operations/PEMToHex.mjs",
            "src/core/lib/Base64.mjs",
            "src/core/lib/Hex.mjs",
            "tests/operations/tests/PEMtoHex.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {PEM_OPERATION_PROFILE_CONFIGS};
