import assert from "assert";
import NormaliseUnicode from "../../../src/core/operations/NormaliseUnicode.mjs";
import TextIntegerConverter from "../../../src/core/operations/TextIntegerConverter.mjs";
import {
    BOUNDED_TEXT_CONVERSION_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {PREFLIGHT_ISSUE_CODE, preflightOperationRecipe} from
    "../../../src/web/webmcp/OperationPreflight.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {
    TEXT_INTEGER_MAX_INPUT_BYTES,
    TEXT_INTEGER_OUTPUT_FORMATS,
    UNICODE_NORMALISATION_FORMS,
    UNICODE_NORMALISATION_MAX_INPUT_BYTES,
} from "../../../src/web/webmcp/BoundedTextConversionOperationProfiles.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const issueCodes = result => new Set(result.issues.map(issue => issue.code));


TestRegister.addApiTests([
    it("WebMCPBoundedTextConversionOperationProfiles: should define the reviewed batch", () => {
        assert.deepStrictEqual(
            BOUNDED_TEXT_CONVERSION_OPERATION_PROFILES.map(profile => profile.operationName),
            ["Text-Integer Conversion", "Normalise Unicode"]
        );
        for (const profile of BOUNDED_TEXT_CONVERSION_OPERATION_PROFILES) {
            assert.equal(profile.resourceLimits.complexity, "superlinear");
        }
    }),

    it("WebMCPBoundedTextConversionOperationProfiles: should constrain exact formats", () => {
        const integer = getOperationProfile("Text-Integer Conversion"),
            normalise = getOperationProfile("Normalise Unicode");

        assert.deepStrictEqual(resolveOperationProfileArguments(integer).arguments, ["Decimal"]);
        for (const format of TEXT_INTEGER_OUTPUT_FORMATS) {
            assert.equal(resolveOperationProfileArguments(integer, [format]).valid, true);
        }
        assert.deepStrictEqual(resolveOperationProfileArguments(normalise).arguments, ["NFD"]);
        for (const form of UNICODE_NORMALISATION_FORMS) {
            assert.equal(resolveOperationProfileArguments(normalise, [form]).valid, true);
        }
        assert.equal(resolveOperationProfileArguments(integer, ["Binary"]).valid, false);
        assert.equal(resolveOperationProfileArguments(normalise, ["NFX"]).valid, false);
    }),

    it("WebMCPBoundedTextConversionOperationProfiles: should cover actual output", () => {
        const integerOperation = new TextIntegerConverter(),
            integerLimits = getOperationProfile("Text-Integer Conversion").resourceLimits,
            normaliseOperation = new NormaliseUnicode(),
            normaliseLimits = getOperationProfile("Normalise Unicode").resourceLimits;

        for (const [input, format] of [
            ["A".repeat(1024), "Decimal"],
            ["A".repeat(1024), "Hexadecimal"],
            ["1".repeat(1024), "String"],
        ]) {
            const output = integerOperation.run(input, [format]);
            assert(Buffer.byteLength(output, "utf8") <=
                estimateOperationOutputBytes(integerLimits, Buffer.byteLength(input, "utf8")), format);
        }
        for (const form of UNICODE_NORMALISATION_FORMS) {
            const input = "\ufdfa\u00c7C\u0327",
                output = normaliseOperation.run(input, [form]);
            assert(Buffer.byteLength(output, "utf8") <=
                estimateOperationOutputBytes(normaliseLimits, Buffer.byteLength(input, "utf8")), form);
        }
    }),

    it("WebMCPBoundedTextConversionOperationProfiles: should enforce each hard cap", () => {
        for (const [operationName, argumentsValue, maximum] of [
            ["Text-Integer Conversion", ["Hexadecimal"], TEXT_INTEGER_MAX_INPUT_BYTES],
            ["Normalise Unicode", ["NFKD"], UNICODE_NORMALISATION_MAX_INPUT_BYTES],
        ]) {
            const operation = {operationName, arguments: argumentsValue},
                allowed = preflightOperationRecipe([operation], maximum),
                blocked = preflightOperationRecipe([operation], maximum + 1);

            assert.equal(allowed.agentBakeAllowed, true, operationName);
            assert.equal(blocked.agentBakeAllowed, false, operationName);
            assert(issueCodes(blocked).has(PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT), operationName);
        }
    }),
]);
