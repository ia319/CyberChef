import assert from "assert";
import ChangeIPFormat from "../../../src/core/operations/ChangeIPFormat.mjs";
import {
    IP_FORMAT_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {IP_FORMATS} from "../../../src/web/webmcp/IpFormatOperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const IP_INPUTS = Object.freeze({
    "Dotted Decimal": "192.168.1.1",
    "Decimal": "3232235777",
    "Octal": "030052000401",
    "Hex": "c0a80101",
});


TestRegister.addApiTests([
    it("WebMCPIPFormatOperationProfiles: should define the reviewed conversion", () => {
        assert.deepStrictEqual(
            IP_FORMAT_OPERATION_PROFILES.map(profile => profile.operationName),
            ["Change IP format"]
        );
        const profile = getOperationProfile("Change IP format");
        assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments,
            ["Dotted Decimal", "Hex"]);
        assert.deepStrictEqual(profile.argumentRules.map(rule => rule.values),
            [IP_FORMATS, IP_FORMATS]);
    }),

    it("WebMCPIPFormatOperationProfiles: should bound every format pair", () => {
        const operation = new ChangeIPFormat(),
            limits = getOperationProfile("Change IP format").resourceLimits;

        for (const inputFormat of IP_FORMATS) {
            for (const outputFormat of IP_FORMATS) {
                const input = IP_INPUTS[inputFormat],
                    output = operation.run(input, [inputFormat, outputFormat]);
                assert(Buffer.byteLength(output, "utf8") <=
                    estimateOperationOutputBytes(limits, Buffer.byteLength(input, "utf8")),
                `${inputFormat} to ${outputFormat}`);
            }
        }
        const shortOutput = operation.run("a", ["Hex", "Octal"]);
        assert(Buffer.byteLength(shortOutput, "utf8") <= estimateOperationOutputBytes(limits, 1));
    }),

    it("WebMCPIPFormatOperationProfiles: should reject unknown formats", () => {
        const profile = getOperationProfile("Change IP format");
        assert.equal(resolveOperationProfileArguments(profile, ["IPv6", "Hex"]).valid, false);
        assert.equal(preflightOperationRecipe([
            {operationName: "Change IP format", arguments: ["Decimal", "Dotted Decimal"]},
        ], 10).agentBakeAllowed, true);
    }),
]);
