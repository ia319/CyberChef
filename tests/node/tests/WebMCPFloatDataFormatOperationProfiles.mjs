import assert from "assert";
import {
    FLOAT_DATA_FORMAT_OPERATION_PROFILES,
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
    it("WebMCPFloatDataFormatOperationProfiles: should define the reviewed Float pair", () => {
        assert.deepStrictEqual(
            FLOAT_DATA_FORMAT_OPERATION_PROFILES.map(profile => profile.operationName),
            ["To Float", "From Float"]
        );
        for (const profile of FLOAT_DATA_FORMAT_OPERATION_PROFILES) {
            assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, [
                "Big Endian",
                "Float (4 bytes)",
                "Space",
            ]);
            assert.equal(profile.resourceLimits.maxExpansionRatio, 8);
        }
    }),

    it("WebMCPFloatDataFormatOperationProfiles: should constrain exact format options", () => {
        for (const operationName of ["To Float", "From Float"]) {
            const profile = getOperationProfile(operationName);
            assert.equal(resolveOperationProfileArguments(profile, [
                "Little Endian",
                "Double (8 bytes)",
                "CRLF",
            ]).valid, true);
            for (const argumentsValue of [
                ["Middle Endian", "Float (4 bytes)", "Space"],
                ["Big Endian", "Half (2 bytes)", "Space"],
                ["Big Endian", "Float (4 bytes)", "None"],
            ]) {
                assert.deepStrictEqual(resolveOperationProfileArguments(profile, argumentsValue), {
                    valid: false,
                    code: PROFILE_VALIDATION_CODE.CORE_ARGUMENT_VALUE,
                });
            }
        }
    }),

    it("WebMCPFloatDataFormatOperationProfiles: should budget a Float round trip", () => {
        const result = preflightOperationRecipe([
            operationStep("To Float", ["Little Endian", "Double (8 bytes)", "CRLF"]),
            operationStep("From Float", ["Little Endian", "Double (8 bytes)", "CRLF"]),
        ], 1024);

        assert.equal(result.recipeValid, true);
        assert.equal(result.standardModificationAllowed, true);
        assert.equal(result.agentBakeAllowed, true);
        assert.deepStrictEqual(result.resource, {
            activeInputBytes: 1024,
            estimatedFinalBytes: 65536,
            estimatedWorkBytes: 73728,
        });
    }),
]);
