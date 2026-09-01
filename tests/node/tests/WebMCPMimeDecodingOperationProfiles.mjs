import assert from "assert";
import MIMEDecoding from "../../../src/core/operations/MIMEDecoding.mjs";
import {
    MIME_DECODING_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {MIME_DECODING_MAX_INPUT_BYTES} from
    "../../../src/web/webmcp/MimeDecodingOperationProfiles.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {
    PREFLIGHT_ISSUE_CODE,
    preflightOperationRecipe,
} from "../../../src/web/webmcp/OperationPreflight.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPMimeDecodingOperationProfiles: should define the reviewed decoder", () => {
        assert.deepStrictEqual(
            MIME_DECODING_OPERATION_PROFILES.map(profile => profile.operationName),
            ["MIME Decoding"]
        );
        const profile = getOperationProfile("MIME Decoding");
        assert.deepStrictEqual(resolveOperationProfileArguments(profile).arguments, []);
    }),

    it("WebMCPMimeDecodingOperationProfiles: should bound pass-through bytes", () => {
        const input = new Uint8Array(1024).fill(0x80),
            output = new MIMEDecoding().run(input, []),
            limits = getOperationProfile("MIME Decoding").resourceLimits;

        assert(Buffer.byteLength(output, "utf8") <= estimateOperationOutputBytes(limits, input.length));
    }),

    it("WebMCPMimeDecodingOperationProfiles: should enforce the parser input cap", () => {
        const operation = {operationName: "MIME Decoding", arguments: []},
            allowed = preflightOperationRecipe([operation], MIME_DECODING_MAX_INPUT_BYTES),
            blocked = preflightOperationRecipe([operation], MIME_DECODING_MAX_INPUT_BYTES + 1);

        assert.equal(allowed.agentBakeAllowed, true);
        assert.equal(blocked.agentBakeAllowed, false);
        assert(blocked.issues.some(issue => issue.code === PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT));
    }),
]);
