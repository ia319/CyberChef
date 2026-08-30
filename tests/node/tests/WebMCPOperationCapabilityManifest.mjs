import assert from "assert";
import {
    CAPABILITY_FIELDS,
    OPERATION_CAPABILITY_MANIFEST,
    OPERATION_POLICY,
    REVIEW_STATUS,
    createOperationCapabilityManifest,
} from "../../../src/web/webmcp/OperationCapabilityManifest.mjs";
import { OPERATION_CATALOG, createOperationCatalog } from "../../../src/web/webmcp/OperationCatalog.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const DENIED_OPERATIONS = Object.freeze([
    "HTTP request",
    "DNS over HTTPS",
    "Magic",
    "Parse colour code",
    "Render Markdown",
    "Render PDF",
    "Scatter chart",
    "Series chart",
    "Show on map",
]);

const createConfig = operationNames => Object.fromEntries(operationNames.map(operationName => [operationName, {
    description: "Description",
    module: "Default",
    inputType: "string",
    coreOutputType: "string",
    outputType: "string",
}]));


TestRegister.addApiTests([
    it("WebMCPOperationCapabilityManifest: should cover every catalog Operation exactly once", () => {
        assert.equal(OPERATION_CAPABILITY_MANIFEST.size, OPERATION_CATALOG.size);
        assert.deepStrictEqual(
            OPERATION_CAPABILITY_MANIFEST.getOperationNames(),
            OPERATION_CATALOG.getOperationNames()
        );
        assert.equal(new Set(OPERATION_CAPABILITY_MANIFEST.getOperationNames()).size, OPERATION_CATALOG.size);
    }),

    it("WebMCPOperationCapabilityManifest: should deny unreviewed Operations by default", () => {
        const capability = OPERATION_CAPABILITY_MANIFEST.getOperationCapability("Reverse");

        assert.equal(capability.reviewStatus, REVIEW_STATUS.UNREVIEWED);
        assert.equal(capability.mutationPolicy, OPERATION_POLICY.BLOCKED);
        assert.equal(capability.agentBakePolicy, OPERATION_POLICY.BLOCKED);
        assert.deepStrictEqual(capability.riskCodes, ["UNREVIEWED_OPERATION"]);
        assert.equal(capability.network, null);
        assert.equal(capability.resourceLimits, null);
    }),

    it("WebMCPOperationCapabilityManifest: should preserve known structural capabilities", () => {
        const unzip = OPERATION_CAPABILITY_MANIFEST.getOperationCapability("Unzip"),
            magic = OPERATION_CAPABILITY_MANIFEST.getOperationCapability("Magic");

        assert.equal(unzip.coreOutputType, "List<File>");
        assert.equal(unzip.presentType, "html");
        assert.equal(unzip.fileArtifact, true);
        assert.equal(unzip.htmlPresentation, true);
        assert.equal(magic.flowControl, true);
        assert.equal(magic.scriptExecution, true);
    }),

    it("WebMCPOperationCapabilityManifest: should expose all capability fields", () => {
        for (const operationName of OPERATION_CAPABILITY_MANIFEST.getOperationNames()) {
            const capability = OPERATION_CAPABILITY_MANIFEST.getOperationCapability(operationName);
            for (const field of CAPABILITY_FIELDS) {
                assert.equal(Object.prototype.hasOwnProperty.call(capability, field), true, `${operationName}: ${field}`);
            }
        }
    }),

    it("WebMCPOperationCapabilityManifest: should deny the audited risk lower bound", () => {
        for (const operationName of DENIED_OPERATIONS) {
            const capability = OPERATION_CAPABILITY_MANIFEST.getOperationCapability(operationName);
            assert.equal(capability.reviewStatus, REVIEW_STATUS.DENIED, operationName);
            assert.equal(capability.mutationPolicy, OPERATION_POLICY.BLOCKED, operationName);
            assert.equal(capability.agentBakePolicy, OPERATION_POLICY.BLOCKED, operationName);
            assert(capability.riskCodes.length > 0, operationName);
            assert(capability.evidence.length > 0, operationName);
        }
    }),

    it("WebMCPOperationCapabilityManifest: should default new and prototype-like names to unreviewed", () => {
        const config = Object.create(null);
        Object.assign(config, createConfig(["New Operation", "constructor"]));
        Object.defineProperty(config, "__proto__", {
            value: createConfig(["placeholder"]).placeholder,
            enumerable: true,
        });

        const manifest = createOperationCapabilityManifest(createOperationCatalog(config), []);
        for (const operationName of ["New Operation", "constructor", "__proto__"]) {
            assert.equal(
                manifest.getOperationCapability(operationName).reviewStatus,
                REVIEW_STATUS.UNREVIEWED,
                operationName
            );
        }
        assert.equal(manifest.getOperationCapability("toString"), null);
    }),

    it("WebMCPOperationCapabilityManifest: should reject stale and duplicate reviewed policies", () => {
        const catalog = createOperationCatalog(createConfig(["Known"])),
            policy = {
                operationName: "Known",
                reviewStatus: REVIEW_STATUS.DENIED,
                capabilities: {},
                riskCodes: [],
                evidence: [],
                reviewedOn: "2026-08-30",
            };

        assert.throws(() => createOperationCapabilityManifest(catalog, [{...policy, operationName: "Missing"}]), RangeError);
        assert.throws(() => createOperationCapabilityManifest(catalog, [policy, policy]), RangeError);
        assert.throws(() => createOperationCapabilityManifest(catalog, [{
            ...policy,
            capabilities: {netwrok: true},
        }]), TypeError);
    }),
]);
