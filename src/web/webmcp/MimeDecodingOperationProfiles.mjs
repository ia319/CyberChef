import {boundedSuperlinearResourceLimits} from "./OperationResourcePolicy.mjs";

const MIME_DECODING_MAX_INPUT_BYTES = 64 * 1024;

const MIME_DECODING_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "MIME Decoding",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            2,
            64,
            MIME_DECODING_MAX_INPUT_BYTES
        ),
        evidence: Object.freeze([
            "src/core/operations/MIMEDecoding.mjs",
            "src/core/lib/Base64.mjs",
            "src/core/lib/Hex.mjs",
            "tests/operations/tests/MIMEDecoding.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    MIME_DECODING_MAX_INPUT_BYTES,
    MIME_DECODING_OPERATION_PROFILE_CONFIGS,
};
