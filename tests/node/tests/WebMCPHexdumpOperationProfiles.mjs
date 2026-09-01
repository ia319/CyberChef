import assert from "assert";
import ToHexdump from "../../../src/core/operations/ToHexdump.mjs";
import {
    HEXDUMP_OPERATION_PROFILES,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {PREFLIGHT_ISSUE_CODE, preflightOperationRecipe} from
    "../../../src/web/webmcp/OperationPreflight.mjs";
import {estimateOperationOutputBytes} from
    "../../../src/web/webmcp/OperationResourcePolicy.mjs";
import {
    AGENT_HEXDUMP_MAX_WIDTH,
    HEXDUMP_MAX_EXPANSION_RATIO,
    HEXDUMP_MAX_FIXED_OUTPUT_BYTES,
    HEXDUMP_PARSE_MAX_INPUT_BYTES,
} from "../../../src/web/webmcp/HexdumpOperationProfiles.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const issueCodes = result => new Set(result.issues.map(issue => issue.code));


TestRegister.addApiTests([
    it("WebMCPHexdumpOperationProfiles: should define the reviewed Hexdump pair", () => {
        assert.deepStrictEqual(
            HEXDUMP_OPERATION_PROFILES.map(profile => profile.operationName),
            ["To Hexdump", "From Hexdump"]
        );
        assert.deepStrictEqual(
            resolveOperationProfileArguments(getOperationProfile("To Hexdump")).arguments,
            [16, false, false, false]
        );
        assert.deepStrictEqual(
            resolveOperationProfileArguments(getOperationProfile("From Hexdump")).arguments,
            []
        );
    }),

    it("WebMCPHexdumpOperationProfiles: should bound width and exact flags", () => {
        const profile = getOperationProfile("To Hexdump");

        for (const width of [1, AGENT_HEXDUMP_MAX_WIDTH]) {
            assert.equal(resolveOperationProfileArguments(
                profile, [width, true, true, true]
            ).valid, true);
        }
        for (const width of [0, 1.5, AGENT_HEXDUMP_MAX_WIDTH + 1]) {
            assert.equal(resolveOperationProfileArguments(
                profile, [width, false, false, false]
            ).valid, false);
        }
        assert.equal(resolveOperationProfileArguments(
            profile, [16, false, false, "false"]
        ).valid, false);
    }),

    it("WebMCPHexdumpOperationProfiles: should preserve the output and parser bounds", () => {
        assert.deepStrictEqual(getOperationProfile("To Hexdump").resourceLimits, {
            complexity: "linear",
            maxInputBytes: 4 * 1024 * 1024,
            maxOutputBytes: 4 * 1024 * 1024,
            maxExpansionRatio: HEXDUMP_MAX_EXPANSION_RATIO,
            baseOutputBytes: HEXDUMP_MAX_FIXED_OUTPUT_BYTES,
            workFactor: 1,
        });
        assert.deepStrictEqual(getOperationProfile("From Hexdump").resourceLimits, {
            complexity: "superlinear",
            maxInputBytes: HEXDUMP_PARSE_MAX_INPUT_BYTES,
            maxOutputBytes: HEXDUMP_PARSE_MAX_INPUT_BYTES,
            maxExpansionRatio: 1,
            baseOutputBytes: 0,
            workFactor: 32,
        });
    }),

    it("WebMCPHexdumpOperationProfiles: should cover materialized Hexdump output", () => {
        const operation = new ToHexdump(),
            limits = getOperationProfile("To Hexdump").resourceLimits;

        for (const width of [1, 16, AGENT_HEXDUMP_MAX_WIDTH]) {
            for (const inputBytes of [1, width, width + 1, 1024]) {
                const input = new Uint8Array(inputBytes).buffer,
                    output = operation.run(input, [width, false, true, false]),
                    estimate = estimateOperationOutputBytes(limits, inputBytes);
                assert(Buffer.byteLength(output, "utf8") <= estimate, `${width}:${inputBytes}`);
            }
        }
    }),

    it("WebMCPHexdumpOperationProfiles: should reject parser input above its hard cap", () => {
        const operation = {operationName: "From Hexdump", arguments: []},
            allowed = preflightOperationRecipe([operation], HEXDUMP_PARSE_MAX_INPUT_BYTES),
            blocked = preflightOperationRecipe([operation], HEXDUMP_PARSE_MAX_INPUT_BYTES + 1);

        assert.equal(allowed.agentBakeAllowed, true);
        assert.equal(blocked.standardModificationAllowed, true);
        assert.equal(blocked.agentBakeAllowed, false);
        assert(issueCodes(blocked).has(PREFLIGHT_ISSUE_CODE.STEP_INPUT_LIMIT));
    }),
]);
