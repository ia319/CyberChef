import assert from "assert";
import EscapeUnicodeCharacters from
    "../../../src/core/operations/EscapeUnicodeCharacters.mjs";
import ToHTMLEntity from "../../../src/core/operations/ToHTMLEntity.mjs";
import {HTML_ENTITY_LOOKUP} from "../../../src/core/lib/HTMLEntities.mjs";
import {
    TEXT_ESCAPING_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const operationStep = (operationName, argumentsValue) => ({
    operationName,
    arguments: argumentsValue,
});


TestRegister.addApiTests([
    it("WebMCPTextEscapingOperationProfiles: should define the reviewed escaping batch", () => {
        assert.deepStrictEqual(
            TEXT_ESCAPING_OPERATION_PROFILES.map(profile => profile.operationName),
            [
                "Escape Unicode Characters",
                "Unescape Unicode Characters",
                "To HTML Entity",
                "From HTML Entity",
            ]
        );
    }),

    it("WebMCPTextEscapingOperationProfiles: should constrain exact argument domains", () => {
        const escape = getOperationProfile("Escape Unicode Characters"),
            unescape = getOperationProfile("Unescape Unicode Characters"),
            toEntity = getOperationProfile("To HTML Entity"),
            fromEntity = getOperationProfile("From HTML Entity");

        assert.deepStrictEqual(resolveOperationProfileArguments(escape).arguments,
            ["\\u", false, 4, true]);
        assert.equal(resolveOperationProfileArguments(escape, ["U+", true, 8, false]).valid, true);
        for (const padding of [-1, 1.5, 9]) {
            assert.equal(resolveOperationProfileArguments(
                escape, ["\\u", false, padding, true]
            ).valid, false);
        }
        assert.equal(resolveOperationProfileArguments(unescape, ["%u"]).valid, true);
        assert.equal(resolveOperationProfileArguments(unescape, ["u+"]).valid, false);
        assert.equal(resolveOperationProfileArguments(
            toEntity, [true, "Hex entities"]
        ).valid, true);
        assert.equal(resolveOperationProfileArguments(
            toEntity, [false, "XML entities"]
        ).valid, false);
        assert.deepStrictEqual(resolveOperationProfileArguments(fromEntity).arguments, []);
    }),

    it("WebMCPTextEscapingOperationProfiles: should cover escaping output materialization", () => {
        const escape = new EscapeUnicodeCharacters(),
            escapeLimits = getOperationProfile("Escape Unicode Characters").resourceLimits,
            entity = new ToHTMLEntity(),
            entityLimits = getOperationProfile("To HTML Entity").resourceLimits;

        for (const input of ["A", "\n", "é", "😀"]) {
            const inputBytes = Buffer.byteLength(input, "utf8"),
                output = escape.run(input, ["U+", true, 8, true]);
            assert(Buffer.byteLength(output, "utf8") <=
                estimateOperationOutputBytes(escapeLimits, inputBytes), input);
        }
        for (const codePoint of Object.keys(HTML_ENTITY_LOOKUP)) {
            const input = String.fromCodePoint(Number(codePoint)),
                inputBytes = Buffer.byteLength(input, "utf8"),
                output = entity.run(input, [false, "Named entities"]);
            assert(Buffer.byteLength(output, "utf8") <=
                estimateOperationOutputBytes(entityLimits, inputBytes), codePoint);
        }
    }),

    it("WebMCPTextEscapingOperationProfiles: should budget a complete escaping chain", () => {
        const result = preflightOperationRecipe([
            operationStep("Escape Unicode Characters", ["U+", true, 8, true]),
            operationStep("Unescape Unicode Characters", ["U+"]),
            operationStep("To HTML Entity", [true, "Named entities"]),
            operationStep("From HTML Entity", []),
        ], 1024);

        assert.equal(result.recipeValid, true);
        assert.equal(result.agentBakeAllowed, true);
        assert.deepStrictEqual(result.resource, {
            activeInputBytes: 1024,
            estimatedFinalBytes: 102400,
            estimatedWorkBytes: 225280,
        });
    }),
]);
