import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const BRAILLE_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "To Braille",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(3),
        evidence: Object.freeze([
            "src/core/operations/ToBraille.mjs",
            "src/core/lib/Braille.mjs",
            "tests/operations/tests/Braille.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Braille",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromBraille.mjs",
            "src/core/lib/Braille.mjs",
            "tests/operations/tests/Braille.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {BRAILLE_OPERATION_PROFILE_CONFIGS};
