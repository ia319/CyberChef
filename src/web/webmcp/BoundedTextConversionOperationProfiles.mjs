import {enumRule} from "./OperationProfileRules.mjs";
import {boundedSuperlinearResourceLimits} from "./OperationResourcePolicy.mjs";

const TEXT_INTEGER_OUTPUT_FORMATS = Object.freeze([
    "String",
    "Decimal",
    "Hexadecimal",
]);

const UNICODE_NORMALISATION_FORMS = Object.freeze([
    "NFD",
    "NFC",
    "NFKD",
    "NFKC",
]);

const TEXT_INTEGER_MAX_INPUT_BYTES = 4 * 1024;
const UNICODE_NORMALISATION_MAX_INPUT_BYTES = 64 * 1024;

const BOUNDED_TEXT_CONVERSION_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "Text-Integer Conversion",
        argumentRules: Object.freeze([enumRule(TEXT_INTEGER_OUTPUT_FORMATS)]),
        defaultArguments: Object.freeze(["Decimal"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            3,
            128,
            TEXT_INTEGER_MAX_INPUT_BYTES,
            2,
            16 * 1024
        ),
        evidence: Object.freeze([
            "src/core/operations/TextIntegerConverter.mjs",
            "tests/operations/tests/TextIntegerConverter.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "Normalise Unicode",
        argumentRules: Object.freeze([enumRule(UNICODE_NORMALISATION_FORMS)]),
        defaultArguments: Object.freeze(["NFD"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            64,
            64,
            UNICODE_NORMALISATION_MAX_INPUT_BYTES,
            0,
            4 * 1024 * 1024
        ),
        evidence: Object.freeze([
            "src/core/operations/NormaliseUnicode.mjs",
            "src/core/lib/ChrEnc.mjs",
            "tests/operations/tests/NormaliseUnicode.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    BOUNDED_TEXT_CONVERSION_OPERATION_PROFILE_CONFIGS,
    TEXT_INTEGER_MAX_INPUT_BYTES,
    TEXT_INTEGER_OUTPUT_FORMATS,
    UNICODE_NORMALISATION_FORMS,
    UNICODE_NORMALISATION_MAX_INPUT_BYTES,
};
