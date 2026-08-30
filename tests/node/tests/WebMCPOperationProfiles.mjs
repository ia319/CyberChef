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
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
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
]);
