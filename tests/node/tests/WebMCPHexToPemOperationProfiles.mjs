import assert from "assert";
import HexToPEM from "../../../src/core/operations/HexToPEM.mjs";
import {
    HEX_TO_PEM_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {PEM_HEADER_LABELS} from "../../../src/web/webmcp/HexToPemOperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const SAMPLE_HEX = "596164612059616461";


TestRegister.addApiTests([
    it("WebMCPHexToPemOperationProfiles: should define the reviewed conversion", () => {
        assert.deepStrictEqual(
            HEX_TO_PEM_OPERATION_PROFILES.map(profile => profile.operationName),
            ["Hex to PEM"]
        );
        const profile = getOperationProfile("Hex to PEM");
        assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, ["CERTIFICATE"]);
        assert.deepStrictEqual(profile.argumentRules[0].values, PEM_HEADER_LABELS);
    }),

    it("WebMCPHexToPemOperationProfiles: should bound every fixed header", () => {
        const operation = new HexToPEM(),
            limits = getOperationProfile("Hex to PEM").resourceLimits;

        for (const header of PEM_HEADER_LABELS) {
            const output = operation.run(SAMPLE_HEX, [header]);
            assert(output.startsWith(`-----BEGIN ${header}-----\r\n`), header);
            assert(output.endsWith(`-----END ${header}-----\r\n`), header);
            assert(Buffer.byteLength(output, "utf8") <=
                estimateOperationOutputBytes(limits, Buffer.byteLength(SAMPLE_HEX, "utf8")), header);
        }
    }),

    it("WebMCPHexToPemOperationProfiles: should reject arbitrary headers", () => {
        const profile = getOperationProfile("Hex to PEM");
        assert.equal(resolveOperationProfileArguments(profile, ["CUSTOM\nHEADER"]).valid, false);
        assert.equal(preflightOperationRecipe([
            {operationName: "Hex to PEM", arguments: ["PUBLIC KEY"]},
        ], Buffer.byteLength(SAMPLE_HEX, "utf8")).agentBakeAllowed, true);
    }),
]);
