import {
    booleanRule,
    integerRule,
} from "./OperationProfileRules.mjs";
import {
    boundedSuperlinearResourceLimits,
    linearResourceLimits,
} from "./OperationResourcePolicy.mjs";

const AGENT_HEXDUMP_MAX_WIDTH = 256;
const HEXDUMP_PARSE_MAX_INPUT_BYTES = 64 * 1024;
const HEXDUMP_MAX_EXPANSION_RATIO = 18;
const HEXDUMP_MAX_FIXED_OUTPUT_BYTES = 791;

const HEXDUMP_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "To Hexdump",
        argumentRules: Object.freeze([
            integerRule(1, AGENT_HEXDUMP_MAX_WIDTH),
            booleanRule(),
            booleanRule(),
            booleanRule(),
        ]),
        defaultArguments: Object.freeze([16, false, false, false]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(
            HEXDUMP_MAX_EXPANSION_RATIO,
            HEXDUMP_MAX_FIXED_OUTPUT_BYTES
        ),
        evidence: Object.freeze([
            "src/core/operations/ToHexdump.mjs",
            "tests/operations/tests/Hexdump.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From Hexdump",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: boundedSuperlinearResourceLimits(
            1,
            32,
            HEXDUMP_PARSE_MAX_INPUT_BYTES,
            0,
            HEXDUMP_PARSE_MAX_INPUT_BYTES
        ),
        evidence: Object.freeze([
            "src/core/operations/FromHexdump.mjs",
            "src/core/lib/Hex.mjs",
            "tests/operations/tests/Hexdump.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    AGENT_HEXDUMP_MAX_WIDTH,
    HEXDUMP_MAX_EXPANSION_RATIO,
    HEXDUMP_MAX_FIXED_OUTPUT_BYTES,
    HEXDUMP_OPERATION_PROFILE_CONFIGS,
    HEXDUMP_PARSE_MAX_INPUT_BYTES,
};
