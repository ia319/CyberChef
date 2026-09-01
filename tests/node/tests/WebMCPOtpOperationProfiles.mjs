import assert from "assert";
import {
    APPROVAL_OPERATION_PROFILES,
    PROFILE_VALIDATION_CODE,
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../../../src/web/webmcp/OperationProfiles.mjs";
import {OPERATION_CAPABILITY_MANIFEST} from "../../../src/web/webmcp/OperationCapabilityManifest.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPOtpOperationProfiles: should define bounded HOTP arguments and resources", () => {
        const profile = getOperationProfile("Generate HOTP");

        assert.deepStrictEqual(
            APPROVAL_OPERATION_PROFILES.map(item => item.operationName),
            ["Generate HOTP"]
        );
        assert.deepStrictEqual(profile.defaultArguments, ["Account", 6, 0]);
        assert.deepStrictEqual(profile.sensitiveArgumentIndexes, [0]);
        assert.deepStrictEqual(profile.resourceLimits, {
            complexity: "linear",
            maxInputBytes: 4096,
            maxOutputBytes: 8192,
            maxExpansionRatio: 1,
            baseOutputBytes: 512,
            workFactor: 1,
        });
        assert.equal(resolveOperationProfileArguments(profile, ["user@example.com", 8, 42]).valid, true);
    }),

    it("WebMCPOtpOperationProfiles: should narrow the core HOTP argument domain", () => {
        const profile = getOperationProfile("Generate HOTP"),
            nameCanary = "SECRET_NAME_CANARY";

        assert.deepStrictEqual(resolveOperationProfileArguments(profile, ["", 6, 0]), {
            valid: false,
            code: PROFILE_VALIDATION_CODE.CORE_ARGUMENT_VALUE,
        });
        assert.equal(resolveOperationProfileArguments(profile, ["A".repeat(129), 6, 0]).valid, false);
        assert.equal(resolveOperationProfileArguments(profile, ["Account\nName", 6, 0]).valid, false);
        assert.equal(resolveOperationProfileArguments(profile, ["账户", 6, 0]).valid, false);
        assert.equal(resolveOperationProfileArguments(profile, [nameCanary, 5, 0]).valid, false);
        assert.equal(resolveOperationProfileArguments(profile, [nameCanary, 9, 0]).valid, false);
        assert.equal(resolveOperationProfileArguments(profile, [nameCanary, 6, -1]).valid, false);
        assert.equal(resolveOperationProfileArguments(profile, [nameCanary, 6, 1.5]).valid, false);
    }),

    it("WebMCPOtpOperationProfiles: should require one-use approval for HOTP", () => {
        const capability = OPERATION_CAPABILITY_MANIFEST.getOperationCapability("Generate HOTP");

        assert.equal(capability.reviewStatus, "constrained");
        assert.equal(capability.mutationPolicy, "userActionRequired");
        assert.equal(capability.agentBakePolicy, "userActionRequired");
        assert.equal(capability.nondeterministic, true);
        assert.deepStrictEqual(capability.approvalSummary, {
            sensitiveParameterNames: ["Name"],
            riskFlags: ["secretInput", "sensitiveOutput"],
        });
    }),
]);
