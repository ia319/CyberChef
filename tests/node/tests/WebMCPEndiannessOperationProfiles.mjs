import assert from "assert";
import SwapEndianness from "../../../src/core/operations/SwapEndianness.mjs";
import {
    ENDIANNESS_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {MAX_ENDIANNESS_WORD_BYTES} from
    "../../../src/web/webmcp/EndiannessOperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPEndiannessOperationProfiles: should define the reviewed conversion", () => {
        assert.deepStrictEqual(
            ENDIANNESS_OPERATION_PROFILES.map(profile => profile.operationName),
            ["Swap endianness"]
        );
        const profile = getOperationProfile("Swap endianness");
        assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments,
            ["Hex", 4, true]);
    }),

    it("WebMCPEndiannessOperationProfiles: should restrict the word length", () => {
        const profile = getOperationProfile("Swap endianness");
        assert.equal(resolveOperationProfileArguments(profile, ["Hex", 1, false]).valid, true);
        assert.equal(resolveOperationProfileArguments(
            profile, ["Raw", MAX_ENDIANNESS_WORD_BYTES, true]
        ).valid, true);
        for (const wordLength of [0, 1.5, MAX_ENDIANNESS_WORD_BYTES + 1]) {
            assert.equal(resolveOperationProfileArguments(
                profile, ["Hex", wordLength, true]
            ).valid, false);
        }
    }),

    it("WebMCPEndiannessOperationProfiles: should include maximum padding", () => {
        const operation = new SwapEndianness(),
            limits = getOperationProfile("Swap endianness").resourceLimits,
            output = operation.run("ff", ["Hex", MAX_ENDIANNESS_WORD_BYTES, true]);

        assert.equal(output.split(" ").length, MAX_ENDIANNESS_WORD_BYTES);
        assert(Buffer.byteLength(output, "utf8") <= estimateOperationOutputBytes(limits, 2));
        assert.equal(preflightOperationRecipe([
            {operationName: "Swap endianness", arguments: ["Raw", 2, false]},
        ], 4).agentBakeAllowed, true);
    }),
]);
