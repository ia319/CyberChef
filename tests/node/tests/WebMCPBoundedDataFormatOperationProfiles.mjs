import assert from "assert";
import {
    BOUNDED_DATA_FORMAT_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {PREFLIGHT_ISSUE_CODE, preflightOperationRecipe} from
    "../../../src/web/webmcp/OperationPreflight.mjs";
import {
    BOUNDED_DATA_FORMAT_INPUT_BYTES,
    COBS_MAX_EXPANSION_RATIO,
} from "../../../src/web/webmcp/BoundedDataFormatOperationProfiles.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const operationStep = operationName => ({operationName, arguments: []});
const issueCodes = result => new Set(result.issues.map(issue => issue.code));


TestRegister.addApiTests([
    it("WebMCPBoundedDataFormatOperationProfiles: should define the slice-bound batch", () => {
        assert.deepStrictEqual(
            BOUNDED_DATA_FORMAT_OPERATION_PROFILES.map(profile => profile.operationName),
            ["To Base92", "To COBS", "From COBS"]
        );
        for (const profile of BOUNDED_DATA_FORMAT_OPERATION_PROFILES) {
            assert.equal(profile.resourceLimits.complexity, "superlinear");
            assert.equal(profile.resourceLimits.maxInputBytes, BOUNDED_DATA_FORMAT_INPUT_BYTES);
            assert.equal(profile.resourceLimits.workFactor, 64);
            assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, []);
            assert.equal(resolveOperationProfileArguments(profile, ["SECRET_EXTRA_CANARY"]).valid, false);
        }
    }),

    it("WebMCPBoundedDataFormatOperationProfiles: should preserve conservative output bounds", () => {
        assert.deepStrictEqual(getOperationProfile("To Base92").resourceLimits, {
            complexity: "superlinear",
            maxInputBytes: 65536,
            maxOutputBytes: 131074,
            maxExpansionRatio: 2,
            baseOutputBytes: 2,
            workFactor: 64,
        });
        assert.equal(getOperationProfile("To COBS").resourceLimits.maxExpansionRatio,
            COBS_MAX_EXPANSION_RATIO);
        assert.equal(getOperationProfile("To COBS").resourceLimits.maxOutputBytes, 67584);
        assert.equal(getOperationProfile("From COBS").resourceLimits.maxExpansionRatio, 1);
        assert.equal(getOperationProfile("From COBS").resourceLimits.maxOutputBytes, 65536);
    }),

    it("WebMCPBoundedDataFormatOperationProfiles: should reject each Operation above its hard cap", () => {
        for (const operationName of ["To Base92", "To COBS", "From COBS"]) {
            const allowed = preflightOperationRecipe([
                    operationStep(operationName),
                ], BOUNDED_DATA_FORMAT_INPUT_BYTES),
                blocked = preflightOperationRecipe([
                    operationStep(operationName),
                ], BOUNDED_DATA_FORMAT_INPUT_BYTES + 1);

            assert.equal(allowed.agentBakeAllowed, true, operationName);
            assert.equal(blocked.standardModificationAllowed, true, operationName);
            assert.equal(blocked.agentBakeAllowed, false, operationName);
            assert(issueCodes(blocked).has(PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT), operationName);
        }
    }),
]);
