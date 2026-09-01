import assert from "assert";
import {
    BOUNDED_NUMERIC_DECODE_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {PREFLIGHT_ISSUE_CODE, preflightOperationRecipe} from
    "../../../src/web/webmcp/OperationPreflight.mjs";
import {
    BASE_DECODE_MAX_INPUT_BYTES,
    BCD_DECODE_MAX_INPUT_BYTES,
    BCD_ENCODING_SCHEMES,
    BCD_INPUT_FORMATS,
} from "../../../src/web/webmcp/BoundedNumericDecodeOperationProfiles.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const issueCodes = result => new Set(result.issues.map(issue => issue.code));


TestRegister.addApiTests([
    it("WebMCPBoundedNumericDecodeOperationProfiles: should define the reviewed decoders", () => {
        assert.deepStrictEqual(
            BOUNDED_NUMERIC_DECODE_OPERATION_PROFILES.map(profile => profile.operationName),
            ["From Base", "From BCD"]
        );
        for (const profile of BOUNDED_NUMERIC_DECODE_OPERATION_PROFILES) {
            assert.equal(profile.resourceLimits.complexity, "superlinear");
            assert.equal(profile.resourceLimits.workFactor, 64);
        }
    }),

    it("WebMCPBoundedNumericDecodeOperationProfiles: should constrain From Base radix", () => {
        const profile = getOperationProfile("From Base");

        assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, [36]);
        for (const radix of [2, 16, 36]) {
            assert.equal(resolveOperationProfileArguments(profile, [radix]).valid, true);
        }
        for (const radix of [1, 2.5, 37]) {
            assert.equal(resolveOperationProfileArguments(profile, [radix]).valid, false);
        }
        assert.equal(profile.resourceLimits.maxInputBytes, BASE_DECODE_MAX_INPUT_BYTES);
    }),

    it("WebMCPBoundedNumericDecodeOperationProfiles: should constrain From BCD options", () => {
        const profile = getOperationProfile("From BCD");

        assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments,
            ["8 4 2 1", true, false, "Nibbles"]);
        for (const scheme of BCD_ENCODING_SCHEMES) {
            for (const format of BCD_INPUT_FORMATS) {
                assert.equal(resolveOperationProfileArguments(
                    profile, [scheme, false, true, format]
                ).valid, true);
            }
        }
        assert.equal(resolveOperationProfileArguments(
            profile, ["SECRET_SCHEME_CANARY", true, false, "Raw"]
        ).valid, false);
        assert.equal(profile.resourceLimits.maxInputBytes, BCD_DECODE_MAX_INPUT_BYTES);
    }),

    it("WebMCPBoundedNumericDecodeOperationProfiles: should enforce each decoder cap", () => {
        for (const [operationName, argumentsValue, maximum] of [
            ["From Base", [16], BASE_DECODE_MAX_INPUT_BYTES],
            ["From BCD", ["8 4 2 1", false, true, "Raw"], BCD_DECODE_MAX_INPUT_BYTES],
        ]) {
            const operation = {operationName, arguments: argumentsValue},
                allowed = preflightOperationRecipe([operation], maximum),
                blocked = preflightOperationRecipe([operation], maximum + 1);

            assert.equal(allowed.agentBakeAllowed, true, operationName);
            assert.equal(blocked.standardModificationAllowed, true, operationName);
            assert.equal(blocked.agentBakeAllowed, false, operationName);
            assert(issueCodes(blocked).has(PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT), operationName);
        }
    }),
]);
