import assert from "assert";
import OperationConfig from "../../../src/core/config/OperationConfig.json" with { type: "json" };
import { ALPHABET_OPTIONS as BASE32_ALPHABETS } from "../../../src/core/lib/Base32.mjs";
import { ALPHABET as BASE45_ALPHABET } from "../../../src/core/lib/Base45.mjs";
import { ALPHABET_OPTIONS as BASE58_ALPHABETS } from "../../../src/core/lib/Base58.mjs";
import { ALPHABET_OPTIONS as BASE85_ALPHABETS } from "../../../src/core/lib/Base85.mjs";
import { BIN_DELIM_OPTIONS } from "../../../src/core/lib/Delim.mjs";
import {
    BINARY_DELIMITERS,
    DATA_FORMAT_ALPHABETS,
} from "../../../src/web/webmcp/DataFormatOperationProfiles.mjs";
import {
    DATA_FORMAT_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {
    PREFLIGHT_ISSUE_CODE,
    preflightOperationRecipe,
} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const DATA_FORMAT_OPERATION_NAMES = Object.freeze([
    "From Base32",
    "To Base32",
    "From Base45",
    "To Base45",
    "From Base58",
    "To Base58",
    "From Base62",
    "To Base62",
    "From Base85",
    "To Base85",
    "From Bech32",
    "To Bech32",
    "From Binary",
    "To Binary",
]);

const resolve = (operationName, values) =>
    resolveOperationProfileArguments(getOperationProfile(operationName), values);
const operationStep = (operationName, values=undefined) => {
    const step = {operationName};
    if (typeof values !== "undefined") step.arguments = values;
    return step;
};
const issueCodes = result => new Set(result.issues.map(issue => issue.code));


TestRegister.addApiTests([
    it("WebMCPDataFormatOperationProfiles: should define fourteen independently reviewed profiles", () => {
        assert.deepStrictEqual(
            DATA_FORMAT_OPERATION_PROFILES.map(profile => profile.operationName),
            DATA_FORMAT_OPERATION_NAMES
        );
        for (const profile of DATA_FORMAT_OPERATION_PROFILES) {
            assert.equal(profile.argumentRules.length, OperationConfig[profile.operationName].args.length);
            assert.equal(resolveOperationProfileArguments(profile).valid, true, profile.operationName);
            assert.deepStrictEqual(profile.sensitiveArgumentIndexes, [], profile.operationName);
            assert(profile.evidence.length >= 3, profile.operationName);
            assert.equal(profile.reviewedOn, "2026-09-01", profile.operationName);
        }
    }),

    it("WebMCPDataFormatOperationProfiles: should detect audited source default drift", () => {
        assert.deepStrictEqual(DATA_FORMAT_ALPHABETS.BASE32, BASE32_ALPHABETS.map(option => option.value));
        assert.deepStrictEqual(DATA_FORMAT_ALPHABETS.BASE45, [BASE45_ALPHABET]);
        assert.deepStrictEqual(DATA_FORMAT_ALPHABETS.BASE58, BASE58_ALPHABETS.map(option => option.value));
        assert.deepStrictEqual(DATA_FORMAT_ALPHABETS.BASE62, [OperationConfig["To Base62"].args[0].value]);
        assert.deepStrictEqual(DATA_FORMAT_ALPHABETS.BASE85, BASE85_ALPHABETS.map(option => option.value));
        assert.deepStrictEqual(BINARY_DELIMITERS, BIN_DELIM_OPTIONS);
    }),

    it("WebMCPDataFormatOperationProfiles: should constrain custom alphabet semantics", () => {
        const reversedBase58 = [...DATA_FORMAT_ALPHABETS.BASE58[0]].reverse().join("");

        assert.equal(resolve("To Base32", ["a-z2-7="]).valid, true);
        assert.equal(resolve("To Base32", ["a-z2-7A"]).valid, false);
        assert.equal(resolve("To Base32", ["A-Z2-6A="]).valid, false);

        assert.equal(resolve("To Base45", ["0-9B-ZA $%*+\\-./:"]).valid, true);
        assert.equal(resolve("To Base45", ["1-9A-Z0 $%*+\\-./:"]).valid, false);

        assert.equal(resolve("To Base58", [reversedBase58]).valid, true);
        assert.equal(resolve("To Base58", [DATA_FORMAT_ALPHABETS.BASE58[0].slice(0, -1) + "1"]).valid, false);

        assert.equal(resolve("To Base62", ["0-9A-Za-z"]).valid, true);
        assert.equal(resolve("To Base62", ["0-9A-Za-y+"]).valid, false);

        assert.equal(resolve("To Base85", [DATA_FORMAT_ALPHABETS.BASE85[2], true]).valid, true);
        assert.equal(resolve("To Base85", [DATA_FORMAT_ALPHABETS.BASE85[0] + "!", false]).valid, false);
    }),

    it("WebMCPDataFormatOperationProfiles: should keep the Base85 zero marker outside its alphabet", () => {
        assert.equal(resolve("From Base85", ["!-u", true, "z"]).valid, true);
        assert.equal(resolve("From Base85", ["!-u", false, ""]).valid, true);
        assert.equal(resolve("From Base85", ["!-tz", true, "z"]).valid, false);
        assert.equal(resolve("From Base85", ["!-u", true, "zz"]).valid, false);
    }),

    it("WebMCPDataFormatOperationProfiles: should bind Bech32 mode, encoding, and witness version", () => {
        const generic = ["bc", "Bech32m", "Raw bytes", "Generic", 0],
            segwitV0 = ["bc", "Bech32", "Raw bytes", "Bitcoin SegWit", 0],
            segwitV1 = ["bc", "Bech32m", "Raw bytes", "Bitcoin SegWit", 1];

        assert.equal(resolve("To Bech32", generic).valid, true);
        assert.equal(resolve("To Bech32", segwitV0).valid, true);
        assert.equal(resolve("To Bech32", segwitV1).valid, true);
        assert.equal(resolve("To Bech32", [...generic.slice(0, 4), 1]).valid, false);
        assert.equal(resolve("To Bech32", ["bc", "Bech32m", "Raw bytes", "Bitcoin SegWit", 0]).valid, false);
        assert.equal(resolve("To Bech32", ["bc", "Bech32", "Raw bytes", "Bitcoin SegWit", 1]).valid, false);
        assert.equal(resolve("To Bech32", ["", "Bech32", "Raw bytes", "Generic", 0]).valid, false);
        assert.equal(resolve("To Bech32", ["币", "Bech32", "Raw bytes", "Generic", 0]).valid, false);
        assert.equal(resolve("To Bech32", ["a".repeat(17), "Bech32", "Raw bytes", "Generic", 0]).valid, false);

        assert.equal(resolve("From Bech32", ["Auto-detect", "JSON"]).valid, true);
        assert.equal(resolve("From Bech32", ["auto", "JSON"]).valid, false);
    }),

    it("WebMCPDataFormatOperationProfiles: should narrow Binary byte lengths", () => {
        for (const value of [1, 8]) assert.equal(resolve("From Binary", ["Space", value]).valid, true);
        for (const value of [9, 32, 256]) assert.equal(resolve("From Binary", ["Space", value]).valid, false);
        for (const value of [1, 8, 32]) assert.equal(resolve("To Binary", ["CRLF", value]).valid, true);
        for (const value of [33, 256]) assert.equal(resolve("To Binary", ["CRLF", value]).valid, false);
        assert.equal(resolve("From Binary", ["Space", 0]).valid, false);
        assert.equal(resolve("To Binary", ["Space", 1.5]).valid, false);
    }),

    it("WebMCPDataFormatOperationProfiles: should apply operation-specific resource limits", () => {
        const fromBase58 = getOperationProfile("From Base58").resourceLimits,
            toBase32 = getOperationProfile("To Base32").resourceLimits,
            toBase62 = getOperationProfile("To Base62").resourceLimits,
            fromBech32 = getOperationProfile("From Bech32").resourceLimits,
            toBech32 = getOperationProfile("To Bech32").resourceLimits,
            toBinary = getOperationProfile("To Binary").resourceLimits;

        assert.deepStrictEqual(
            [fromBase58.complexity, fromBase58.maxInputBytes, fromBase58.workFactor],
            ["superlinear", 4096, 16]
        );
        assert.deepStrictEqual(
            [toBase32.maxExpansionRatio, toBase32.baseOutputBytes],
            [1.6, 7]
        );
        assert.deepStrictEqual(
            [toBase62.complexity, toBase62.maxInputBytes, toBase62.workFactor],
            ["superlinear", 1024, 64]
        );
        assert.deepStrictEqual(
            [fromBech32.baseOutputBytes, fromBech32.maxInputBytes, fromBech32.maxOutputBytes],
            [256, 90, 512]
        );
        assert.deepStrictEqual(
            [toBech32.baseOutputBytes, toBech32.maxInputBytes, toBech32.maxOutputBytes],
            [24, 40, 90]
        );
        assert.equal(toBinary.maxExpansionRatio, 34);
    }),

    it("WebMCPDataFormatOperationProfiles: should preflight single and cumulative resource bounds", () => {
        const allowed = preflightOperationRecipe([
                operationStep("From Base32"),
                operationStep("To Base45"),
            ], 1024),
            base62Limit = preflightOperationRecipe([operationStep("To Base62")], 1025),
            bech32Limit = preflightOperationRecipe([operationStep("To Bech32")], 41),
            binaryExpansion = preflightOperationRecipe([
                operationStep("To Binary", ["CRLF", 32]),
            ], 128 * 1024),
            cumulativeWork = preflightOperationRecipe([
                operationStep("From Base62"),
                operationStep("From Base62"),
            ], 1024),
            cumulativeExpansion = preflightOperationRecipe(
                Array.from({length: 6}, () => operationStep("To Base32")),
                256 * 1024
            );

        assert.equal(allowed.agentBakeAllowed, true);
        assert.equal(base62Limit.agentBakeAllowed, false);
        assert(issueCodes(base62Limit).has(PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT));
        assert.equal(bech32Limit.agentBakeAllowed, false);
        assert(issueCodes(bech32Limit).has(PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT));
        assert.equal(binaryExpansion.agentBakeAllowed, false);
        assert(issueCodes(binaryExpansion).has(PREFLIGHT_ISSUE_CODE.STEP_OUTPUT_LIMIT));
        assert.equal(cumulativeWork.agentBakeAllowed, true);
        assert.equal(cumulativeWork.resource.estimatedWorkBytes, 128 * 1024);
        assert.equal(cumulativeExpansion.agentBakeAllowed, false);
        assert(issueCodes(cumulativeExpansion).has(PREFLIGHT_ISSUE_CODE.STEP_OUTPUT_LIMIT));
    }),
]);
