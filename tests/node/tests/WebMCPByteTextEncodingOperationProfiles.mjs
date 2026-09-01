import assert from "assert";
import ToHexContent from "../../../src/core/operations/ToHexContent.mjs";
import ToModhex from "../../../src/core/operations/ToModhex.mjs";
import {
    BYTE_TEXT_ENCODING_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPByteTextEncodingOperationProfiles: should define the reviewed batch", () => {
        assert.deepStrictEqual(
            BYTE_TEXT_ENCODING_OPERATION_PROFILES.map(profile => profile.operationName),
            ["To Hex Content", "From Hex Content", "To Modhex", "From Modhex"]
        );
    }),

    it("WebMCPByteTextEncodingOperationProfiles: should constrain exact arguments", () => {
        const toContent = getOperationProfile("To Hex Content"),
            fromContent = getOperationProfile("From Hex Content"),
            toModhex = getOperationProfile("To Modhex"),
            fromModhex = getOperationProfile("From Modhex");

        assert.deepStrictEqual(resolveOperationProfileArguments(toContent).arguments,
            ["Only special chars", false]);
        assert.equal(resolveOperationProfileArguments(
            toContent, ["All chars", true]
        ).valid, true);
        assert.deepStrictEqual(resolveOperationProfileArguments(fromContent).arguments, []);
        assert.deepStrictEqual(resolveOperationProfileArguments(toModhex).arguments, ["Space", 0]);
        assert.equal(resolveOperationProfileArguments(toModhex, ["CRLF", 256]).valid, true);
        for (const lineSize of [-1, 1.5, 257]) {
            assert.equal(resolveOperationProfileArguments(toModhex, ["Space", lineSize]).valid, false);
        }
        assert.deepStrictEqual(resolveOperationProfileArguments(fromModhex).arguments, ["Auto"]);
        assert.equal(resolveOperationProfileArguments(fromModhex, ["Percent"]).valid, true);
    }),

    it("WebMCPByteTextEncodingOperationProfiles: should cover encoded materialization", () => {
        const input = Uint8Array.from({length: 1024}, (_, index) => index % 256);

        for (const [operationName, operation, argumentsValues] of [
            ["To Hex Content", new ToHexContent(), [
                ["Only special chars", false],
                ["Only special chars including spaces", true],
                ["All chars", true],
            ]],
            ["To Modhex", new ToModhex(), [
                ["None", 0],
                ["CRLF", 1],
                ["Comma", 256],
            ]],
        ]) {
            const limits = getOperationProfile(operationName).resourceLimits,
                estimate = estimateOperationOutputBytes(limits, input.byteLength);
            for (const argumentsValue of argumentsValues) {
                const output = operation.run(input.buffer, argumentsValue);
                assert(Buffer.byteLength(output, "utf8") <= estimate,
                    `${operationName}:${argumentsValue.join(",")}`);
            }
        }
    }),

    it("WebMCPByteTextEncodingOperationProfiles: should budget both round trips", () => {
        const result = preflightOperationRecipe([
            {operationName: "To Hex Content", arguments: ["All chars", true]},
            {operationName: "From Hex Content", arguments: []},
            {operationName: "To Modhex", arguments: ["CRLF", 1]},
            {operationName: "From Modhex", arguments: ["Auto"]},
        ], 1024);

        assert.equal(result.recipeValid, true);
        assert.equal(result.agentBakeAllowed, true);
        assert.deepStrictEqual(result.resource, {
            activeInputBytes: 1024,
            estimatedFinalBytes: 20490,
            estimatedWorkBytes: 50188,
        });
    }),
]);
