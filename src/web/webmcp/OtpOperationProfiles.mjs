import {
    integerRule,
    stringRule,
} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const OTP_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "Generate HOTP",
        argumentRules: Object.freeze([
            stringRule(1, 128, 0x20, 0x7e),
            integerRule(6, 8),
            integerRule(0, Number.MAX_SAFE_INTEGER),
        ]),
        defaultArguments: Object.freeze(["Account", 6, 0]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([0]),
        resourceLimits: linearResourceLimits(1, 512, 4 * 1024, 8 * 1024),
        evidence: Object.freeze([
            "src/core/operations/GenerateHOTP.mjs",
            "tests/operations/tests/OTP.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {OTP_OPERATION_PROFILE_CONFIGS};
