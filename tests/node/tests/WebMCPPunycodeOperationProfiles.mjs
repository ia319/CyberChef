import assert from "assert";
import ToPunycode from "../../../src/core/operations/ToPunycode.mjs";
import {
    PUNYCODE_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {PREFLIGHT_ISSUE_CODE, preflightOperationRecipe} from
    "../../../src/web/webmcp/OperationPreflight.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {PUNYCODE_MAX_INPUT_BYTES} from
    "../../../src/web/webmcp/PunycodeOperationProfiles.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const issueCodes = result => new Set(result.issues.map(issue => issue.code));


TestRegister.addApiTests([
    it("WebMCPPunycodeOperationProfiles: should define the reviewed pair", () => {
        assert.deepStrictEqual(
            PUNYCODE_OPERATION_PROFILES.map(profile => profile.operationName),
            ["To Punycode", "From Punycode"]
        );
        for (const profile of PUNYCODE_OPERATION_PROFILES) {
            assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, [false]);
            assert.equal(resolveOperationProfileArguments(profile, [true]).valid, true);
            assert.equal(resolveOperationProfileArguments(profile, ["true"]).valid, false);
            assert.equal(profile.resourceLimits.maxInputBytes, PUNYCODE_MAX_INPUT_BYTES);
            assert.equal(profile.resourceLimits.workFactor, 64);
        }
    }),

    it("WebMCPPunycodeOperationProfiles: should cover encoded materialization", () => {
        const operation = new ToPunycode(),
            limits = getOperationProfile("To Punycode").resourceLimits,
            input = Array.from({length: 512}, (_, index) =>
                String.fromCodePoint(0x1000 + index)).join(""),
            output = operation.run(input, [false]),
            inputBytes = Buffer.byteLength(input, "utf8");

        assert(Buffer.byteLength(output, "utf8") <=
            estimateOperationOutputBytes(limits, inputBytes));
    }),

    it("WebMCPPunycodeOperationProfiles: should enforce each hard cap", () => {
        for (const [operationName, argumentsValue] of [
            ["To Punycode", [false]],
            ["From Punycode", [true]],
        ]) {
            const operation = {operationName, arguments: argumentsValue},
                allowed = preflightOperationRecipe([operation], PUNYCODE_MAX_INPUT_BYTES),
                blocked = preflightOperationRecipe([operation], PUNYCODE_MAX_INPUT_BYTES + 1);

            assert.equal(allowed.agentBakeAllowed, true, operationName);
            assert.equal(blocked.agentBakeAllowed, false, operationName);
            assert(issueCodes(blocked).has(PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT), operationName);
        }
    }),
]);
