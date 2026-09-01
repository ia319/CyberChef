import {enumRule} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const UNMAPPABLE_CHARACTER_POLICIES = Object.freeze([
    "Include",
    "Remove",
    "Replace with '.'",
]);

const LINEAR_DATA_FORMAT_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "From Base92",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromBase92.mjs",
            "src/core/lib/Base92.mjs",
            "tests/operations/tests/Base92.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "Caret/M-decode",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/CaretMdecode.mjs",
            "tests/operations/tests/CaretMdecode.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "Escape Smart Characters",
        argumentRules: Object.freeze([enumRule(UNMAPPABLE_CHARACTER_POLICIES)]),
        defaultArguments: Object.freeze([UNMAPPABLE_CHARACTER_POLICIES[0]]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(4),
        evidence: Object.freeze([
            "src/core/operations/EscapeSmartCharacters.mjs",
            "tests/operations/tests/EscapeSmartCharacters.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    LINEAR_DATA_FORMAT_OPERATION_PROFILE_CONFIGS,
    UNMAPPABLE_CHARACTER_POLICIES,
};
