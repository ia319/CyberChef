import {booleanRule} from "./OperationProfileRules.mjs";
import {boundedSuperlinearResourceLimits} from "./OperationResourcePolicy.mjs";

const PUNYCODE_MAX_INPUT_BYTES = 4 * 1024;

const PUNYCODE_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "To Punycode",
        argumentRules: Object.freeze([booleanRule()]),
        defaultArguments: Object.freeze([false]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            8,
            64,
            PUNYCODE_MAX_INPUT_BYTES,
            16,
            64 * 1024
        ),
        evidence: Object.freeze([
            "src/core/operations/ToPunycode.mjs",
            "package-lock.json",
            "tests/operations/tests/Punycode.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Punycode",
        argumentRules: Object.freeze([booleanRule()]),
        defaultArguments: Object.freeze([false]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            8,
            64,
            PUNYCODE_MAX_INPUT_BYTES,
            0,
            64 * 1024
        ),
        evidence: Object.freeze([
            "src/core/operations/FromPunycode.mjs",
            "package-lock.json",
            "tests/operations/tests/Punycode.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    PUNYCODE_MAX_INPUT_BYTES,
    PUNYCODE_OPERATION_PROFILE_CONFIGS,
};
