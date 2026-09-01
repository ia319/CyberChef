import assert from "assert";
import {
    NUMERIC_DATA_FORMAT_OPERATION_PROFILES,
    PROFILE_VALIDATION_CODE,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {preflightOperationRecipe} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const operationStep = (operationName, argumentsValue) => ({
    operationName,
    arguments: argumentsValue,
});


TestRegister.addApiTests([
    it("WebMCPNumericDataFormatOperationProfiles: should define the reviewed numeric batch", () => {
        assert.deepStrictEqual(
            NUMERIC_DATA_FORMAT_OPERATION_PROFILES.map(profile => profile.operationName),
            [
                "To Octal",
                "From Octal",
                "To Decimal",
                "From Decimal",
                "To Charcode",
                "From Charcode",
            ]
        );
    }),

    it("WebMCPNumericDataFormatOperationProfiles: should constrain exact argument domains", () => {
        for (const operationName of ["To Octal", "From Octal"]) {
            const profile = getOperationProfile(operationName);
            assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, ["Space"]);
            assert.equal(resolveOperationProfileArguments(profile, ["CRLF"]).valid, true);
            assert.deepStrictEqual(resolveOperationProfileArguments(profile, ["Auto"]), {
                valid: false,
                code: PROFILE_VALIDATION_CODE.CORE_ARGUMENT_VALUE,
            });
        }

        assert.deepStrictEqual(
            resolveOperationProfileArguments(getOperationProfile("To Decimal")).arguments,
            ["Space", false]
        );
        assert.equal(resolveOperationProfileArguments(
            getOperationProfile("From Decimal"), ["Auto", true]
        ).valid, true);

        for (const operationName of ["To Charcode", "From Charcode"]) {
            const profile = getOperationProfile(operationName);
            assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, ["Space", 16]);
            assert.equal(resolveOperationProfileArguments(profile, ["CRLF", 2]).valid, true);
            assert.equal(resolveOperationProfileArguments(profile, ["Space", 36]).valid, true);
            for (const base of [1, 2.5, 37]) {
                assert.equal(resolveOperationProfileArguments(profile, ["Space", base]).valid, false);
            }
        }
    }),

    it("WebMCPNumericDataFormatOperationProfiles: should budget the complete numeric chain", () => {
        const result = preflightOperationRecipe([
            operationStep("To Octal", ["CRLF"]),
            operationStep("From Octal", ["CRLF"]),
            operationStep("To Decimal", ["CRLF", true]),
            operationStep("From Decimal", ["Auto", true]),
            operationStep("To Charcode", ["CRLF", 2]),
            operationStep("From Charcode", ["CRLF", 2]),
        ], 1024);

        assert.equal(result.recipeValid, true);
        assert.equal(result.standardModificationAllowed, true);
        assert.equal(result.agentBakeAllowed, true);
        assert.deepStrictEqual(result.resource, {
            activeInputBytes: 1024,
            estimatedFinalBytes: 706560,
            estimatedWorkBytes: 1452032,
        });
    }),
]);
