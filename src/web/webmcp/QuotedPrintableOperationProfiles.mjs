import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const QUOTED_PRINTABLE_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "To Quoted Printable",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(4),
        evidence: Object.freeze([
            "src/core/operations/ToQuotedPrintable.mjs",
            "tests/operations/tests/QuotedPrintable.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Quoted Printable",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromQuotedPrintable.mjs",
            "tests/operations/tests/QuotedPrintable.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {QUOTED_PRINTABLE_OPERATION_PROFILE_CONFIGS};
