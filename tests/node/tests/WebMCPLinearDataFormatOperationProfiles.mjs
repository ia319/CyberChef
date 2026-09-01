import assert from "assert";
import {
    LINEAR_DATA_FORMAT_OPERATION_PROFILES,
    PROFILE_VALIDATION_CODE,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const operationStep = (operationName, argumentsValue=[]) => ({
    operationName,
    arguments: argumentsValue,
});


TestRegister.addApiTests([
    it("WebMCPLinearDataFormatOperationProfiles: should define the reviewed linear batch", () => {
        assert.deepStrictEqual(
            LINEAR_DATA_FORMAT_OPERATION_PROFILES.map(profile => profile.operationName),
            ["From Base92", "Caret/M-decode", "Escape Smart Characters"]
        );
        assert.equal(getOperationProfile("From Base92").resourceLimits.maxExpansionRatio, 1);
        assert.equal(getOperationProfile("Caret/M-decode").resourceLimits.maxExpansionRatio, 1);
        assert.equal(getOperationProfile("Escape Smart Characters").resourceLimits.maxExpansionRatio, 4);
    }),

    it("WebMCPLinearDataFormatOperationProfiles: should fix exact arguments and defaults", () => {
        const base92 = getOperationProfile("From Base92"),
            caret = getOperationProfile("Caret/M-decode"),
            smart = getOperationProfile("Escape Smart Characters");

        assert.deepStrictEqual(resolveOperationProfileArguments(base92).arguments, []);
        assert.deepStrictEqual(resolveOperationProfileArguments(caret).arguments, []);
        assert.deepStrictEqual(resolveOperationProfileArguments(smart).arguments, ["Include"]);
        for (const value of ["Include", "Remove", "Replace with '.'"]) {
            assert.equal(resolveOperationProfileArguments(smart, [value]).valid, true);
        }
        assert.deepStrictEqual(resolveOperationProfileArguments(smart, ["SECRET_OPTION_CANARY"]), {
            valid: false,
            code: PROFILE_VALIDATION_CODE.CORE_ARGUMENT_VALUE,
        });
        assert.equal(resolveOperationProfileArguments(base92, ["SECRET_EXTRA_CANARY"]).valid, false);
    }),

    it("WebMCPLinearDataFormatOperationProfiles: should budget the complete linear chain", () => {
        const result = preflightOperationRecipe([
            operationStep("From Base92"),
            operationStep("Caret/M-decode"),
            operationStep("Escape Smart Characters", ["Replace with '.'"]),
        ], 1024);

        assert.equal(result.recipeValid, true);
        assert.equal(result.standardModificationAllowed, true);
        assert.equal(result.agentBakeAllowed, true);
        assert.deepStrictEqual(result.resource, {
            activeInputBytes: 1024,
            estimatedFinalBytes: 4096,
            estimatedWorkBytes: 6144,
        });
    }),
]);
