import assert from "assert";
import {
    CAPABILITY_FIELDS,
    OPERATION_CAPABILITY_MANIFEST,
    OPERATION_POLICY,
    REVIEW_STATUS,
    createOperationCapabilityManifest,
} from "../../../src/web/webmcp/OperationCapabilityManifest.mjs";
import { OPERATION_CATALOG, createOperationCatalog } from "../../../src/web/webmcp/OperationCatalog.mjs";
import { linearResourceLimits } from "../../../src/web/webmcp/OperationResourcePolicy.mjs";
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
            magic = OPERATION_CAPABILITY_MANIFEST.getOperationCapability("Magic"),
            powerSet = OPERATION_CAPABILITY_MANIFEST.getOperationCapability("Power Set"),
            register = OPERATION_CAPABILITY_MANIFEST.getOperationCapability("Register");

        assert.equal(unzip.coreOutputType, "List<File>");
        assert.equal(unzip.presentType, "html");
        assert.equal(unzip.decompression, true);
        assert.equal(unzip.fanOut, true);
        assert.equal(unzip.fileArtifact, true);
        assert.equal(unzip.htmlPresentation, true);
        assert.equal(magic.flowControl, true);
        assert.equal(magic.scriptExecution, true);
        assert.equal(powerSet.fanOut, true);
        assert.equal(powerSet.highCost, true);
        assert.equal(register.dataToArgument, true);
        assert.equal(register.regexProbe, true);
    }),

    it("WebMCPOperationCapabilityManifest: should keep catalog-derived capabilities authoritative", () => {
        const catalog = createOperationCatalog({
                Reviewed: {
                    description: "Description",
                    module: "Default",
                    inputType: "string",
                    coreOutputType: "List<File>",
                    outputType: "html",
                    flowControl: true,
                },
            }),
            policy = {
                operationName: "Reviewed",
                reviewStatus: REVIEW_STATUS.SAFE,
                capabilities: {
                    flowControl: false,
                    fileArtifact: false,
                    htmlPresentation: false,
                },
                riskCodes: [],
                evidence: [],
                reviewedOn: "2026-08-30",
                sensitiveArguments: [],
                resourceLimits: linearResourceLimits(1),
                approvalSummary: null,
                mutationPolicy: OPERATION_POLICY.ALLOWED,
                agentBakePolicy: OPERATION_POLICY.ALLOWED,
            },
            capability = createOperationCapabilityManifest(catalog, [policy])
                .getOperationCapability("Reviewed");

        assert.equal(capability.flowControl, true);
        assert.equal(capability.fileArtifact, true);
        assert.equal(capability.htmlPresentation, true);
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

    it("WebMCPOperationCapabilityManifest: should allow only profiled Operations", () => {
        const safeOperations = OPERATION_CAPABILITY_MANIFEST.getOperationNames().filter(operationName =>
            OPERATION_CAPABILITY_MANIFEST.getOperationCapability(operationName).reviewStatus === REVIEW_STATUS.SAFE
        );

        assert.deepStrictEqual(safeOperations, [
            "Caret/M-decode",
            "Decode text",
            "Encode text",
            "Escape Smart Characters",
            "Escape Unicode Characters",
            "From BCD",
            "From Base",
            "From Base32",
            "From Base45",
            "From Base58",
            "From Base62",
            "From Base64",
            "From Base85",
            "From Base92",
            "From Bech32",
            "From Binary",
            "From COBS",
            "From Charcode",
            "From Decimal",
            "From Float",
            "From HTML Entity",
            "From Hex",
            "From Hex Content",
            "From Hexdump",
            "From Modhex",
            "From Octal",
            "From Punycode",
            "From Quoted Printable",
            "Normalise Unicode",
            "PEM to Hex",
            "ROT13",
            "Text-Integer Conversion",
            "To Base32",
            "To Base45",
            "To Base58",
            "To Base62",
            "To Base64",
            "To Base85",
            "To Base92",
            "To Bech32",
            "To Binary",
            "To COBS",
            "To Charcode",
            "To Decimal",
            "To Float",
            "To HTML Entity",
            "To Hex",
            "To Hex Content",
            "To Hexdump",
            "To Modhex",
            "To Octal",
            "To Punycode",
            "To Quoted Printable",
            "URL Decode",
            "URL Encode",
            "Unescape Unicode Characters",
        ]);
        for (const operationName of safeOperations) {
            const capability = OPERATION_CAPABILITY_MANIFEST.getOperationCapability(operationName);
            assert.equal(capability.mutationPolicy, OPERATION_POLICY.ALLOWED, operationName);
            assert.equal(capability.agentBakePolicy, OPERATION_POLICY.ALLOWED, operationName);
            assert(capability.resourceLimits, operationName);
            for (const field of CAPABILITY_FIELDS) assert.equal(capability[field], false, `${operationName}: ${field}`);
        }
    }),

    it("WebMCPOperationCapabilityManifest: should bind HOTP to a redacted approval policy", () => {
        const capability = OPERATION_CAPABILITY_MANIFEST.getOperationCapability("Generate HOTP");

        assert.equal(capability.reviewStatus, REVIEW_STATUS.CONSTRAINED);
        assert.equal(capability.mutationPolicy, OPERATION_POLICY.USER_ACTION_REQUIRED);
        assert.equal(capability.agentBakePolicy, OPERATION_POLICY.USER_ACTION_REQUIRED);
        assert.equal(capability.nondeterministic, true);
        assert.deepStrictEqual(capability.riskCodes, [
            "SECRET_INPUT",
            "SENSITIVE_OUTPUT",
            "NONDETERMINISTIC_OUTPUT",
        ]);
        assert.deepStrictEqual(capability.sensitiveArguments, [0]);
        assert.deepStrictEqual(capability.approvalSummary, {
            sensitiveParameterNames: ["Name"],
            riskFlags: ["secretInput", "sensitiveOutput"],
        });
        assert.equal(Object.isFrozen(capability.approvalSummary), true);
    }),

    it("WebMCPOperationCapabilityManifest: should preserve explicit review counts", () => {
        const counts = Object.fromEntries(Object.values(REVIEW_STATUS).map(status => [status, 0]));
        for (const operationName of OPERATION_CAPABILITY_MANIFEST.getOperationNames()) {
            counts[OPERATION_CAPABILITY_MANIFEST.getOperationCapability(operationName).reviewStatus]++;
        }

        assert.deepStrictEqual(counts, {
            safe: 56,
            constrained: 1,
            denied: 9,
            unreviewed: 438,
        });
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
                sensitiveArguments: null,
                resourceLimits: null,
                approvalSummary: null,
                mutationPolicy: OPERATION_POLICY.BLOCKED,
                agentBakePolicy: OPERATION_POLICY.BLOCKED,
            };

        assert.throws(() => createOperationCapabilityManifest(catalog, [{...policy, operationName: "Missing"}]), RangeError);
        assert.throws(() => createOperationCapabilityManifest(catalog, [policy, policy]), RangeError);
        assert.throws(() => createOperationCapabilityManifest(catalog, [{
            ...policy,
            capabilities: {netwrok: true},
        }]), TypeError);
        assert.throws(() => createOperationCapabilityManifest(catalog, [{
            ...policy,
            reviewStatus: REVIEW_STATUS.CONSTRAINED,
            sensitiveArguments: [],
            resourceLimits: linearResourceLimits(1),
            approvalSummary: {
                sensitiveParameterNames: ["Name"],
                riskFlags: ["unknownRisk"],
            },
            mutationPolicy: OPERATION_POLICY.USER_ACTION_REQUIRED,
            agentBakePolicy: OPERATION_POLICY.USER_ACTION_REQUIRED,
        }]), TypeError);
    }),
]);
