import {boundedSuperlinearResourceLimits} from "./OperationResourcePolicy.mjs";

const BOUNDED_DATA_FORMAT_INPUT_BYTES = 64 * 1024;
const COBS_MAX_EXPANSION_RATIO = 257 / 254;

const BOUNDED_DATA_FORMAT_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "To Base92",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            2,
            64,
            BOUNDED_DATA_FORMAT_INPUT_BYTES,
            2,
            128 * 1024 + 2
        ),
        evidence: Object.freeze([
            "src/core/operations/ToBase92.mjs",
            "src/core/lib/Base92.mjs",
            "tests/operations/tests/Base92.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "To COBS",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            COBS_MAX_EXPANSION_RATIO,
            64,
            BOUNDED_DATA_FORMAT_INPUT_BYTES,
            1,
            66 * 1024
        ),
        evidence: Object.freeze([
            "src/core/operations/ToCOBS.mjs",
            "src/core/lib/COBS.mjs",
            "tests/operations/tests/COBS.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From COBS",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            1,
            64,
            BOUNDED_DATA_FORMAT_INPUT_BYTES,
            0,
            BOUNDED_DATA_FORMAT_INPUT_BYTES
        ),
        evidence: Object.freeze([
            "src/core/operations/FromCOBS.mjs",
            "src/core/lib/COBS.mjs",
            "tests/operations/tests/COBS.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    BOUNDED_DATA_FORMAT_INPUT_BYTES,
    BOUNDED_DATA_FORMAT_OPERATION_PROFILE_CONFIGS,
    COBS_MAX_EXPANSION_RATIO,
};
