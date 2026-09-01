import assert from "assert";
import ToQuotedPrintable from "../../../src/core/operations/ToQuotedPrintable.mjs";
import {
    QUOTED_PRINTABLE_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPQuotedPrintableOperationProfiles: should define the reviewed pair", () => {
        assert.deepStrictEqual(
            QUOTED_PRINTABLE_OPERATION_PROFILES.map(profile => profile.operationName),
            ["To Quoted Printable", "From Quoted Printable"]
        );
        for (const profile of QUOTED_PRINTABLE_OPERATION_PROFILES) {
            assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, []);
            assert.equal(resolveOperationProfileArguments(profile, ["SECRET_EXTRA_CANARY"]).valid, false);
        }
    }),

    it("WebMCPQuotedPrintableOperationProfiles: should cover encoded materialization", () => {
        const operation = new ToQuotedPrintable(),
            limits = getOperationProfile("To Quoted Printable").resourceLimits,
            input = Uint8Array.from({length: 4096}, (_, index) => index % 256),
            output = operation.run(input.buffer, []),
            estimate = estimateOperationOutputBytes(limits, input.byteLength);

        assert(Buffer.byteLength(output, "utf8") <= estimate);
    }),

    it("WebMCPQuotedPrintableOperationProfiles: should budget a round trip", () => {
        const result = preflightOperationRecipe([
            {operationName: "To Quoted Printable", arguments: []},
            {operationName: "From Quoted Printable", arguments: []},
        ], 1024);

        assert.equal(result.recipeValid, true);
        assert.equal(result.agentBakeAllowed, true);
        assert.deepStrictEqual(result.resource, {
            activeInputBytes: 1024,
            estimatedFinalBytes: 4096,
            estimatedWorkBytes: 8192,
        });
    }),
]);
