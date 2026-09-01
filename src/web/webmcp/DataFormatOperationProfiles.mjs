import {
    alphabetRule,
    booleanRule,
    conditionalRule,
    constantRule,
    enumRule,
    integerRule,
    notInAlphabetRelation,
    stringRule,
} from "./OperationProfileRules.mjs";
import {
    boundedSuperlinearResourceLimits,
    linearResourceLimits,
} from "./OperationResourcePolicy.mjs";

const DATA_FORMAT_ALPHABETS = Object.freeze({
    BASE32: Object.freeze(["A-Z2-7=", "0-9A-V="]),
    BASE45: Object.freeze(["0-9A-Z $%*+\\-./:"]),
    BASE58: Object.freeze([
        "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
        "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz",
    ]),
    BASE62: Object.freeze(["0-9A-Za-z"]),
    BASE85: Object.freeze([
        "!-u",
        "0-9a-zA-Z.\\-:+=^!/*?&<>()[]{}@%$#",
        "0-9A-Za-z!#$%&()*+\\-;<=>?@^_`{|}~",
    ]),
});

const BINARY_DELIMITERS = Object.freeze([
    "Space",
    "Comma",
    "Semi-colon",
    "Colon",
    "Line feed",
    "CRLF",
    "None",
]);

const BASE32_ALPHABET_RULE = alphabetRule(33, DATA_FORMAT_ALPHABETS.BASE32, 64, "", "=");
const BASE45_ALPHABET_RULE = alphabetRule(45, DATA_FORMAT_ALPHABETS.BASE45, 64, "0");
const BASE58_ALPHABET_RULE = alphabetRule(58, DATA_FORMAT_ALPHABETS.BASE58, 128);
const BASE62_ALPHABET_RULE = alphabetRule(62, DATA_FORMAT_ALPHABETS.BASE62, 128, "", "", "+-. ");
const BASE85_ALPHABET_RULE = alphabetRule(85, DATA_FORMAT_ALPHABETS.BASE85, 128);

const DATA_FORMAT_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "From Base32",
        argumentRules: [BASE32_ALPHABET_RULE, booleanRule()],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE32[0], true],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromBase32.mjs",
            "src/core/lib/Base32.mjs",
            "tests/operations/tests/Base32.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "To Base32",
        argumentRules: [BASE32_ALPHABET_RULE],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE32[0]],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(1.6, 7),
        evidence: Object.freeze([
            "src/core/operations/ToBase32.mjs",
            "src/core/lib/Base32.mjs",
            "tests/operations/tests/Base32.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "From Base45",
        argumentRules: [BASE45_ALPHABET_RULE, booleanRule()],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE45[0], true],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromBase45.mjs",
            "src/core/lib/Base45.mjs",
            "tests/operations/tests/Base45.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "To Base45",
        argumentRules: [BASE45_ALPHABET_RULE],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE45[0]],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(2),
        evidence: Object.freeze([
            "src/core/operations/ToBase45.mjs",
            "src/core/lib/Base45.mjs",
            "tests/operations/tests/Base45.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "From Base58",
        argumentRules: [BASE58_ALPHABET_RULE, booleanRule()],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE58[0], true],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: boundedSuperlinearResourceLimits(1, 16, 4 * 1024),
        evidence: Object.freeze([
            "src/core/operations/FromBase58.mjs",
            "src/core/lib/Base58.mjs",
            "tests/operations/tests/Base58.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "To Base58",
        argumentRules: [BASE58_ALPHABET_RULE],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE58[0]],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: boundedSuperlinearResourceLimits(2, 16, 4 * 1024),
        evidence: Object.freeze([
            "src/core/operations/ToBase58.mjs",
            "src/core/lib/Base58.mjs",
            "tests/operations/tests/Base58.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "From Base62",
        argumentRules: [BASE62_ALPHABET_RULE],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE62[0]],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: boundedSuperlinearResourceLimits(1, 64, 1024),
        evidence: Object.freeze([
            "src/core/operations/FromBase62.mjs",
            "src/core/operations/ToBase62.mjs",
            "package-lock.json",
            "tests/operations/tests/Base62.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "To Base62",
        argumentRules: [BASE62_ALPHABET_RULE],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE62[0]],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: boundedSuperlinearResourceLimits(2, 64, 1024),
        evidence: Object.freeze([
            "src/core/operations/ToBase62.mjs",
            "src/core/operations/FromBase62.mjs",
            "package-lock.json",
            "tests/operations/tests/Base62.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "From Base85",
        argumentRules: [BASE85_ALPHABET_RULE, booleanRule(), stringRule(0, 1, 0x20, 0x7e)],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE85[0], true, "z"],
        argumentRelations: [notInAlphabetRelation(2, 0)],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(4),
        evidence: Object.freeze([
            "src/core/operations/FromBase85.mjs",
            "src/core/lib/Base85.mjs",
            "tests/operations/tests/Base85.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "To Base85",
        argumentRules: [BASE85_ALPHABET_RULE, booleanRule()],
        defaultArguments: [DATA_FORMAT_ALPHABETS.BASE85[0], false],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(2, 4),
        evidence: Object.freeze([
            "src/core/operations/ToBase85.mjs",
            "src/core/lib/Base85.mjs",
            "tests/operations/tests/Base85.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "From Bech32",
        argumentRules: [
            enumRule(["Auto-detect", "Bech32", "Bech32m"]),
            enumRule(["Raw", "Hex", "Bitcoin scriptPubKey", "HRP: Hex", "JSON"]),
        ],
        defaultArguments: ["Auto-detect", "Raw"],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(2, 256, 90, 512),
        evidence: Object.freeze([
            "src/core/operations/FromBech32.mjs",
            "src/core/lib/Bech32.mjs",
            "tests/operations/tests/Bech32.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "To Bech32",
        argumentRules: [
            stringRule(1, 16, 33, 126),
            conditionalRule(
                3,
                "Bitcoin SegWit",
                conditionalRule(4, 0, constantRule("Bech32"), constantRule("Bech32m")),
                enumRule(["Bech32", "Bech32m"])
            ),
            enumRule(["Raw bytes", "Hex"]),
            enumRule(["Generic", "Bitcoin SegWit"]),
            conditionalRule(3, "Bitcoin SegWit", integerRule(0, 16), constantRule(0)),
        ],
        defaultArguments: ["bc", "Bech32", "Raw bytes", "Generic", 0],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(1.6, 24, 40, 90),
        evidence: Object.freeze([
            "src/core/operations/ToBech32.mjs",
            "src/core/lib/Bech32.mjs",
            "tests/operations/tests/Bech32.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "From Binary",
        argumentRules: [enumRule(BINARY_DELIMITERS), integerRule(1, 8)],
        defaultArguments: ["Space", 8],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromBinary.mjs",
            "src/core/lib/Binary.mjs",
            "src/core/lib/Delim.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
    Object.freeze({
        operationName: "To Binary",
        argumentRules: [enumRule(BINARY_DELIMITERS), integerRule(1, 32)],
        defaultArguments: ["Space", 8],
        argumentRelations: [],
        sensitiveArgumentIndexes: [],
        resourceLimits: linearResourceLimits(34),
        evidence: Object.freeze([
            "src/core/operations/ToBinary.mjs",
            "src/core/lib/Binary.mjs",
            "src/core/lib/Delim.mjs",
        ]),
        reviewedOn: "2026-09-01",
    }),
]);

export {
    BINARY_DELIMITERS,
    DATA_FORMAT_ALPHABETS,
    DATA_FORMAT_OPERATION_PROFILE_CONFIGS,
};
