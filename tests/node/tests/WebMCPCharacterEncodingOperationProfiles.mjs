import assert from "assert";
import OperationConfig from "../../../src/core/config/OperationConfig.json" with {type: "json"};
import DecodeText from "../../../src/core/operations/DecodeText.mjs";
import EncodeText from "../../../src/core/operations/EncodeText.mjs";
import {
    CHARACTER_ENCODING_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {CHARACTER_ENCODINGS} from
    "../../../src/web/webmcp/CharacterEncodingOperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const UNSUPPORTED_CODE_PAGE_IDS = new Set([50220, 50221, 50222, 50225, 50227]);


TestRegister.addApiTests([
    it("WebMCPCharacterEncodingOperationProfiles: should define the reviewed pair", () => {
        assert.deepStrictEqual(
            CHARACTER_ENCODING_OPERATION_PROFILES.map(profile => profile.operationName),
            ["Encode text", "Decode text"]
        );
        assert.equal(CHARACTER_ENCODINGS.length, 147);
        for (const profile of CHARACTER_ENCODING_OPERATION_PROFILES) {
            assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments,
                ["UTF-8 (65001)"]);
            assert.equal(profile.argumentRules[0].values.length, 147);
        }
    }),

    it("WebMCPCharacterEncodingOperationProfiles: should exclude unsupported core options", () => {
        const sourceOptions = OperationConfig["Encode text"].args[0].value,
            excluded = sourceOptions.filter(option => !CHARACTER_ENCODINGS.includes(option));

        assert.equal(sourceOptions.length, 152);
        assert.deepStrictEqual(new Set(excluded.map(option =>
            Number(option.match(/\((\d+)\)$/u)[1]))), UNSUPPORTED_CODE_PAGE_IDS);
    }),

    it("WebMCPCharacterEncodingOperationProfiles: should run every reviewed code page", () => {
        const encoder = new EncodeText(),
            decoder = new DecodeText(),
            encodeLimits = getOperationProfile("Encode text").resourceLimits,
            decodeLimits = getOperationProfile("Decode text").resourceLimits;

        for (const encoding of CHARACTER_ENCODINGS) {
            const encoded = encoder.run("A", [encoding]),
                decoded = decoder.run(encoded, [encoding]);
            assert(encoded.byteLength <= estimateOperationOutputBytes(encodeLimits, 1), encoding);
            assert(Buffer.byteLength(decoded, "utf8") <=
                estimateOperationOutputBytes(decodeLimits, encoded.byteLength), encoding);
        }
    }),

    it("WebMCPCharacterEncodingOperationProfiles: should paginate without changing validation", () => {
        const encode = getOperationProfile("Encode text"),
            decode = getOperationProfile("Decode text"),
            operationConfig = OperationConfig["Encode text"];

        assert.equal(resolveOperationProfileArguments(
            encode, [CHARACTER_ENCODINGS.at(-1)]
        ).valid, true);
        assert.equal(resolveOperationProfileArguments(
            decode, [operationConfig.args[0].value.find(value => value.includes("(50220)"))]
        ).valid, false);
        const result = preflightOperationRecipe([
            {operationName: "Encode text", arguments: ["UTF-32LE (12000)"]},
            {operationName: "Decode text", arguments: ["UTF-32LE (12000)"]},
        ], 1024);
        assert.equal(result.agentBakeAllowed, true);
    }),
]);
