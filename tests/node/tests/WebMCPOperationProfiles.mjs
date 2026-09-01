import assert from "assert";
import OperationConfig from "../../../src/core/config/OperationConfig.json" with { type: "json" };
import { ALPHABET_OPTIONS } from "../../../src/core/lib/Base64.mjs";
import { FROM_HEX_DELIM_OPTIONS, TO_HEX_DELIM_OPTIONS } from "../../../src/core/lib/Hex.mjs";
import {
    BASE64_ALPHABETS,
    FROM_HEX_DELIMITERS,
    GOLDEN_OPERATION_PROFILES,
    GOLDEN_RECIPE_RESOURCE_LIMITS,
    PROFILE_VALIDATION_CODE,
    TO_HEX_DELIMITERS,
    defineOperationProfile,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {
    alphabetRule,
    booleanRule,
    conditionalRule,
    constantRule,
    enumRule,
    integerRule,
    notInAlphabetRelation,
    stringRule,
} from "../../../src/web/webmcp/OperationProfileRules.mjs";
import {
    boundedSuperlinearResourceLimits,
    estimateOperationOutputBytes,
    estimateOperationWorkBytes,
    linearResourceLimits,
} from "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const GOLDEN_OPERATION_NAMES = Object.freeze([
    "From Base64",
    "To Base64",
    "From Hex",
    "To Hex",
    "URL Decode",
    "URL Encode",
    "ROT13",
]);

const GOLDEN_SOURCE_TYPES = Object.freeze({
    "From Base64": ["editableOption", "boolean", "boolean"],
    "To Base64": ["editableOption"],
    "From Hex": ["option"],
    "To Hex": ["option", "number"],
    "URL Decode": ["boolean"],
    "URL Encode": ["boolean"],
    "ROT13": ["boolean", "boolean", "boolean", "number"],
});


TestRegister.addApiTests([
    it("WebMCPOperationProfiles: should define exactly seven reviewed profiles", () => {
        assert.deepStrictEqual(
            GOLDEN_OPERATION_PROFILES.map(profile => profile.operationName),
            GOLDEN_OPERATION_NAMES
        );
        for (const profile of GOLDEN_OPERATION_PROFILES) {
            assert.equal(profile.argumentRules.length, OperationConfig[profile.operationName].args.length);
            assert.deepStrictEqual(
                OperationConfig[profile.operationName].args.map(argument => argument.type),
                GOLDEN_SOURCE_TYPES[profile.operationName]
            );
            assert.equal(profile.defaultArguments.length, profile.argumentRules.length);
            assert.equal(profile.resourceLimits.complexity, "linear");
            assert.equal(profile.resourceLimits.baseOutputBytes, 0);
            assert.equal(profile.resourceLimits.workFactor, 1);
            assert(profile.resourceLimits.maxExpansionRatio >= 1);
            assert(profile.resourceLimits.maxInputBytes <= GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes);
            assert(profile.resourceLimits.maxOutputBytes <= GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes);
        }
    }),

    it("WebMCPOperationProfiles: should keep audited enums independent from source expansion", () => {
        assert.deepStrictEqual(BASE64_ALPHABETS, ALPHABET_OPTIONS.slice(0, 2).map(option => option.value));
        assert.deepStrictEqual(FROM_HEX_DELIMITERS, FROM_HEX_DELIM_OPTIONS);
        assert.deepStrictEqual(TO_HEX_DELIMITERS, TO_HEX_DELIM_OPTIONS);
    }),

    it("WebMCPOperationProfiles: should supply immutable defaults", () => {
        for (const profile of GOLDEN_OPERATION_PROFILES) {
            const result = resolveOperationProfileArguments(profile);
            assert.equal(result.valid, true, profile.operationName);
            assert.deepStrictEqual(result.arguments, profile.defaultArguments);
            assert.equal(Object.isFrozen(result.arguments), true);
        }
    }),

    it("WebMCPOperationProfiles: should validate Base64 flags and audited alphabets", () => {
        const profile = getOperationProfile("From Base64");

        assert.equal(resolveOperationProfileArguments(profile, ["A-Za-z0-9-_", false, true]).valid, true);
        assert.deepStrictEqual(resolveOperationProfileArguments(profile, ["custom", true, false]), {
            valid: false,
            code: PROFILE_VALIDATION_CODE.ARGUMENT_VALUE,
        });
        assert.deepStrictEqual(resolveOperationProfileArguments(profile, ["A-Za-z0-9+/=", true]), {
            valid: false,
            code: PROFILE_VALIDATION_CODE.ARGUMENT_COUNT,
        });
        assert.equal(resolveOperationProfileArguments(profile, ["A-Za-z0-9+/=", "true", false]).valid, false);
    }),

    it("WebMCPOperationProfiles: should fix high-variance numeric arguments", () => {
        const toHex = getOperationProfile("To Hex"),
            rot13 = getOperationProfile("ROT13");

        assert.equal(resolveOperationProfileArguments(toHex, ["0x with comma", 0]).valid, true);
        assert.equal(resolveOperationProfileArguments(toHex, ["0x with comma", 4]).valid, false);
        assert.equal(resolveOperationProfileArguments(rot13, [true, true, false, 13]).valid, true);
        assert.equal(resolveOperationProfileArguments(rot13, [true, true, true, 13]).valid, false);
        assert.equal(resolveOperationProfileArguments(rot13, [true, true, false, -13]).valid, false);
    }),

    it("WebMCPOperationProfiles: should reject unknown and malformed requests", () => {
        assert.equal(getOperationProfile("Reverse"), null);
        assert.equal(resolveOperationProfileArguments(getOperationProfile("URL Encode"), [true]).valid, true);
        assert.equal(resolveOperationProfileArguments(getOperationProfile("URL Encode"), [0]).valid, false);
        assert.equal(resolveOperationProfileArguments(getOperationProfile("URL Encode"), null).valid, false);
    }),

    it("WebMCPOperationProfiles: should apply core validation before Agent restrictions", () => {
        const profile = defineOperationProfile({
            operationName: "From Binary",
            argumentRules: [enumRule(["Space", "None"]), integerRule(1, 32)],
            defaultArguments: ["Space", 8],
            argumentRelations: [],
            sensitiveArgumentIndexes: [],
            resourceLimits: linearResourceLimits(1),
            evidence: ["src/core/operations/FromBinary.mjs"],
            reviewedOn: "2026-09-01",
        });

        assert.equal(resolveOperationProfileArguments(profile, ["Space", 8]).valid, true);
        assert.deepStrictEqual(resolveOperationProfileArguments(profile, ["Space", 0]), {
            valid: false,
            code: PROFILE_VALIDATION_CODE.CORE_ARGUMENT_VALUE,
        });
        assert.deepStrictEqual(resolveOperationProfileArguments(profile, ["Space", 64]), {
            valid: false,
            code: PROFILE_VALIDATION_CODE.ARGUMENT_VALUE,
        });
        assert.deepStrictEqual(resolveOperationProfileArguments(profile, ["Space", 1.5]), {
            valid: false,
            code: PROFILE_VALIDATION_CODE.ARGUMENT_VALUE,
        });
    }),

    it("WebMCPOperationProfiles: should enforce alphabet and cross-argument rules", () => {
        const profileConfig = {
                operationName: "From Base85",
                argumentRules: [
                    alphabetRule(85, ["!-u"]),
                    booleanRule(),
                    stringRule(0, 1, 0x20, 0x7e),
                ],
                defaultArguments: ["!-u", true, "z"],
                argumentRelations: [notInAlphabetRelation(2, 0)],
                sensitiveArgumentIndexes: [],
                resourceLimits: linearResourceLimits(1),
                evidence: ["src/core/operations/FromBase85.mjs"],
                reviewedOn: "2026-09-01",
            },
            profile = defineOperationProfile(profileConfig),
            boundedProfile = defineOperationProfile({
                ...profileConfig,
                argumentRules: [
                    alphabetRule(85, ["!-u"], 256, "!", "u"),
                    booleanRule(),
                    stringRule(0, 1, 0x20, 0x7e),
                ],
            });

        assert.equal(resolveOperationProfileArguments(profile).valid, true);
        assert.equal(resolveOperationProfileArguments(profile, ["!-t", true, "z"]).valid, false);
        assert.equal(resolveOperationProfileArguments(boundedProfile, ["#-w", true, "z"]).valid, false);
        assert.deepStrictEqual(resolveOperationProfileArguments(profile, ["!-tz", true, "z"]), {
            valid: false,
            code: PROFILE_VALIDATION_CODE.ARGUMENT_RELATION,
        });
        assert.equal(resolveOperationProfileArguments(profile, ["!-u", true, "😀"]).valid, false);
        assert.throws(() => alphabetRule(85, ["!-u"], 256, "!", "u", "A"), RangeError);
    }),

    it("WebMCPOperationProfiles: should enforce finite dependent rules", () => {
        const profile = defineOperationProfile({
            operationName: "To Bech32",
            argumentRules: [
                stringRule(1, 16, 33, 126),
                enumRule(["Bech32", "Bech32m"]),
                enumRule(["Raw bytes", "Hex"]),
                enumRule(["Generic", "Bitcoin SegWit"]),
                conditionalRule(3, "Bitcoin SegWit", integerRule(0, 16), constantRule(0)),
            ],
            defaultArguments: ["bc", "Bech32", "Raw bytes", "Generic", 0],
            argumentRelations: [],
            sensitiveArgumentIndexes: [0],
            resourceLimits: linearResourceLimits(2, 16, 40, 90),
            evidence: ["src/core/operations/ToBech32.mjs"],
            reviewedOn: "2026-09-01",
        });

        assert.equal(resolveOperationProfileArguments(profile, [
            "bc", "Bech32m", "Raw bytes", "Bitcoin SegWit", 16,
        ]).valid, true);
        assert.equal(resolveOperationProfileArguments(profile, [
            "bc", "Bech32", "Raw bytes", "Generic", 1,
        ]).valid, false);
        assert.throws(() => conditionalRule(
            3,
            "Bitcoin SegWit",
            integerRule(0, 16),
            constantRule("0")
        ), TypeError);
        assert.deepStrictEqual(profile.sensitiveArgumentIndexes, [0]);
        assert.equal(Object.isFrozen(profile.sensitiveArgumentIndexes), true);
    }),

    it("WebMCPOperationProfiles: should reject open or non-data profile definitions", () => {
        const valid = {
            operationName: "URL Encode",
            argumentRules: [booleanRule()],
            defaultArguments: [false],
            argumentRelations: [],
            sensitiveArgumentIndexes: [],
            resourceLimits: linearResourceLimits(3),
            evidence: ["src/core/operations/URLEncode.mjs"],
            reviewedOn: "2026-09-01",
        };

        assert.throws(() => defineOperationProfile({...valid, extra: true}), TypeError);
        assert.throws(() => defineOperationProfile({...valid, operationName: "Missing"}), TypeError);
        assert.throws(() => defineOperationProfile({...valid, argumentRules: [{type: "future"}]}), TypeError);
        assert.throws(() => defineOperationProfile({...valid, defaultArguments: [NaN]}), TypeError);
        assert.throws(() => defineOperationProfile({
            ...valid,
            resourceLimits: {...valid.resourceLimits, extra: true},
        }), TypeError);
        const inherited = Object.create({operationName: "URL Encode"});
        Object.assign(inherited, valid);
        assert.throws(() => defineOperationProfile(inherited), TypeError);
    }),

    it("WebMCPOperationProfiles: should estimate fixed and linear output costs", () => {
        const limits = linearResourceLimits(2, 16, 40, 90);

        assert.equal(estimateOperationOutputBytes(limits, 0), 16);
        assert.equal(estimateOperationOutputBytes(limits, 20), 56);
        assert.equal(estimateOperationOutputBytes(limits, Number.MAX_SAFE_INTEGER),
            GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes + 1);
        assert.equal(estimateOperationWorkBytes(limits, 20, 56), 56);

        const superlinear = boundedSuperlinearResourceLimits(2, 64, 1024);
        assert.equal(estimateOperationWorkBytes(superlinear, 1024, 2048), 128 * 1024);
    }),
]);
