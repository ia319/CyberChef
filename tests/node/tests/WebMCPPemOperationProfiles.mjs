import assert from "assert";
import PEMToHex from "../../../src/core/operations/PEMToHex.mjs";
import {
    PEM_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const SAMPLE_PEM = "-----BEGIN TEST-----\nQQ==\n-----END TEST-----";


TestRegister.addApiTests([
    it("WebMCPPemOperationProfiles: should define the reviewed conversion", () => {
        assert.deepStrictEqual(
            PEM_OPERATION_PROFILES.map(profile => profile.operationName),
            ["PEM to Hex"]
        );
        const profile = getOperationProfile("PEM to Hex");
        assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, []);
    }),

    it("WebMCPPemOperationProfiles: should bound decoded hexadecimal output", () => {
        const output = new PEMToHex().run(SAMPLE_PEM, []),
            limits = getOperationProfile("PEM to Hex").resourceLimits;

        assert.equal(output, "41");
        assert(Buffer.byteLength(output, "utf8") <=
            estimateOperationOutputBytes(limits, Buffer.byteLength(SAMPLE_PEM, "utf8")));
        assert.equal(preflightOperationRecipe([
            {operationName: "PEM to Hex", arguments: []},
        ], Buffer.byteLength(SAMPLE_PEM, "utf8")).agentBakeAllowed, true);
    }),
]);
