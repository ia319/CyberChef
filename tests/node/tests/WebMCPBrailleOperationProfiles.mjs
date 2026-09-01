import assert from "assert";
import {BRAILLE_LOOKUP} from "../../../src/core/lib/Braille.mjs";
import FromBraille from "../../../src/core/operations/FromBraille.mjs";
import ToBraille from "../../../src/core/operations/ToBraille.mjs";
import {
    BRAILLE_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPBrailleOperationProfiles: should define the reviewed pair", () => {
        assert.deepStrictEqual(
            BRAILLE_OPERATION_PROFILES.map(profile => profile.operationName),
            ["To Braille", "From Braille"]
        );
        for (const profile of BRAILLE_OPERATION_PROFILES) {
            assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, []);
        }
    }),

    it("WebMCPBrailleOperationProfiles: should convert the complete lookup", () => {
        assert.equal(new ToBraille().run(BRAILLE_LOOKUP.ascii, []), BRAILLE_LOOKUP.dot6);
        assert.equal(new FromBraille().run(BRAILLE_LOOKUP.dot6, []), BRAILLE_LOOKUP.ascii);
    }),

    it("WebMCPBrailleOperationProfiles: should bound UTF-8 output and preserve unknown text", () => {
        const input = "ABC 123🙂",
            toBraille = new ToBraille().run(input, []),
            fromBraille = new FromBraille().run(toBraille, []),
            toLimits = getOperationProfile("To Braille").resourceLimits,
            fromLimits = getOperationProfile("From Braille").resourceLimits;

        assert(toBraille.endsWith("🙂"));
        assert.equal(fromBraille, input);
        assert(Buffer.byteLength(toBraille, "utf8") <=
            estimateOperationOutputBytes(toLimits, Buffer.byteLength(input, "utf8")));
        assert(Buffer.byteLength(fromBraille, "utf8") <=
            estimateOperationOutputBytes(fromLimits, Buffer.byteLength(toBraille, "utf8")));
        assert.equal(preflightOperationRecipe([
            {operationName: "To Braille", arguments: []},
            {operationName: "From Braille", arguments: []},
        ], Buffer.byteLength(input, "utf8")).agentBakeAllowed, true);
    }),
]);
