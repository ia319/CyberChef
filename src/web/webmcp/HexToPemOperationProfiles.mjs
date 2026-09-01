import {enumRule} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const PEM_HEADER_LABELS = Object.freeze([
    "CERTIFICATE",
    "CERTIFICATE REQUEST",
    "X509 CRL",
    "PUBLIC KEY",
    "PRIVATE KEY",
    "RSA PUBLIC KEY",
    "RSA PRIVATE KEY",
    "EC PRIVATE KEY",
    "DSA PRIVATE KEY",
]);

const HEX_TO_PEM_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "Hex to PEM",
        argumentRules: Object.freeze([enumRule(PEM_HEADER_LABELS)]),
        defaultArguments: Object.freeze(["CERTIFICATE"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1, 128),
        evidence: Object.freeze([
            "src/core/operations/HexToPEM.mjs",
            "tests/node/tests/operations.mjs",
            "tests/operations/tests/HexToPEM.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    HEX_TO_PEM_OPERATION_PROFILE_CONFIGS,
    PEM_HEADER_LABELS,
};
