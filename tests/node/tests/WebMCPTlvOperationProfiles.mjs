import assert from "assert";
import ParseTLV from "../../../src/core/operations/ParseTLV.mjs";
import {
    TLV_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {TLV_MAX_INPUT_BYTES} from "../../../src/web/webmcp/TlvOperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {
    PREFLIGHT_ISSUE_CODE,
    preflightOperationRecipe,
} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPTlvOperationProfiles: should define the reviewed parser", () => {
        assert.deepStrictEqual(
            TLV_OPERATION_PROFILES.map(profile => profile.operationName),
            ["Parse TLV"]
        );
        const profile = getOperationProfile("Parse TLV");
        assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, [1, 1, false]);
    }),

    it("WebMCPTlvOperationProfiles: should bind BER length configuration", () => {
        const profile = getOperationProfile("Parse TLV");
        for (const arguments_ of [[0, 1, true], [4, 1, true], [0, 4, false]]) {
            assert.equal(resolveOperationProfileArguments(profile, arguments_).valid, true);
        }
        for (const arguments_ of [[-1, 1, false], [5, 1, false], [0, 0, false], [0, 4, true]]) {
            assert.equal(resolveOperationProfileArguments(profile, arguments_).valid, false);
        }
    }),

    it("WebMCPTlvOperationProfiles: should bound zero-length records", () => {
        const input = new Uint8Array(TLV_MAX_INPUT_BYTES).buffer,
            output = new ParseTLV().run(input, [0, 1, false]),
            outputBytes = Buffer.byteLength(JSON.stringify(output, null, 4)),
            limits = getOperationProfile("Parse TLV").resourceLimits;

        assert.equal(output.length, TLV_MAX_INPUT_BYTES);
        assert(outputBytes <= estimateOperationOutputBytes(limits, TLV_MAX_INPUT_BYTES));
    }),

    it("WebMCPTlvOperationProfiles: should enforce the record input cap", () => {
        const operation = {operationName: "Parse TLV", arguments: [1, 1, false]},
            allowed = preflightOperationRecipe([operation], TLV_MAX_INPUT_BYTES),
            blocked = preflightOperationRecipe([operation], TLV_MAX_INPUT_BYTES + 1);

        assert.equal(allowed.agentBakeAllowed, true);
        assert.equal(blocked.agentBakeAllowed, false);
        assert(blocked.issues.some(issue => issue.code === PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT));
    }),
]);
