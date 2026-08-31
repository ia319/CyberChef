import assert from "assert";
import { validateToolInput } from "../../../src/web/webmcp/ToolInput.mjs";
import {
    ACTIVE_BUILD_PROFILE,
    BUILD_PROFILES,
    PROFILE_NAME,
} from "../../../src/web/webmcp/BuildProfiles.mjs";
import {
    FORMAL_TOOL_NAMES,
    READINESS_TOOL_CONTRACT,
    READINESS_TOOL_NAME,
    TOOL_CONTRACTS,
    TOOL_NAME,
} from "../../../src/web/webmcp/ToolDefinitions.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const VALID_INPUTS = Object.freeze({
    [TOOL_NAME.SEARCH_OPERATIONS]: {query: "base64", limit: 5, offset: 0},
    [TOOL_NAME.GET_OPERATION_DETAILS]: {
        name: "To Base64",
        argumentOffset: 0,
        argumentLimit: 3,
        optionOffset: 0,
        optionLimit: 20,
    },
    [TOOL_NAME.GET_RECIPE_STATE]: {},
    [TOOL_NAME.APPLY_RECIPE_PATCH]: {
        expectedRevision: 2,
        changes: [{type: "insert", operation: "To Base64", arguments: ["A-Za-z0-9+/="]}],
    },
    [TOOL_NAME.BAKE_RECIPE]: {expectedRevision: 2},
    [TOOL_NAME.INSPECT_OUTPUT]: {bakeId: 7},
});

const assertDeeplyFrozen = value => {
    if (!value || typeof value !== "object") return;
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) assertDeeplyFrozen(child);
};

const assertClosedObjectSchemas = schema => {
    if (!schema || typeof schema !== "object") return;
    if (schema.type === "object") assert.equal(schema.additionalProperties, false);
    for (const child of schema.oneOf || []) assertClosedObjectSchemas(child);
    for (const child of schema.anyOf || []) assertClosedObjectSchemas(child);
    for (const child of Object.values(schema.properties || {})) assertClosedObjectSchemas(child);
    if (schema.items) assertClosedObjectSchemas(schema.items);
};

const collectDescriptions = schema => {
    if (!schema || typeof schema !== "object") return [];
    const descriptions = typeof schema.description === "string" ? [schema.description] : [];
    for (const child of schema.oneOf || []) descriptions.push(...collectDescriptions(child));
    for (const child of schema.anyOf || []) descriptions.push(...collectDescriptions(child));
    for (const child of Object.values(schema.properties || {})) descriptions.push(...collectDescriptions(child));
    if (schema.items) descriptions.push(...collectDescriptions(schema.items));
    return descriptions;
};

TestRegister.addApiTests([
    it("WebMCPToolDefinitions: should define six fixed formal metadata contracts", () => {
        assert.deepStrictEqual(Object.keys(TOOL_CONTRACTS), FORMAL_TOOL_NAMES);
        assert.equal(FORMAL_TOOL_NAMES.length, 6);

        for (const name of FORMAL_TOOL_NAMES) {
            const contract = TOOL_CONTRACTS[name];
            assert(name.length <= 30);
            assert(contract.title.length > 0);
            assert(contract.description.length <= 500);
            assert.equal(Object.prototype.hasOwnProperty.call(contract, "execute"), false);
            assertDeeplyFrozen(contract);
        }
    }),

    it("WebMCPToolDefinitions: should define an immutable readiness contract", () => {
        assert.equal(Object.prototype.hasOwnProperty.call(READINESS_TOOL_CONTRACT, "execute"), false);
        assertDeeplyFrozen(READINESS_TOOL_CONTRACT);
        assert.equal(validateToolInput({}, READINESS_TOOL_CONTRACT.inputSchema).valid, true);
        assert.equal(validateToolInput({unexpected: true}, READINESS_TOOL_CONTRACT.inputSchema).valid, false);
    }),

    it("WebMCPToolDefinitions: should use closed schemas within metadata budgets", () => {
        for (const contract of Object.values(TOOL_CONTRACTS)) {
            assertClosedObjectSchemas(contract.inputSchema);
            for (const description of collectDescriptions(contract.inputSchema)) {
                assert(description.length <= 150);
            }
            assert.doesNotThrow(() => JSON.stringify(contract.inputSchema));
        }
    }),

    it("WebMCPToolDefinitions: should validate one supported input for every tool", () => {
        for (const name of FORMAL_TOOL_NAMES) {
            const result = validateToolInput(VALID_INPUTS[name], TOOL_CONTRACTS[name].inputSchema);
            assert.equal(result.valid, true, name);
        }
    }),

    it("WebMCPToolDefinitions: should reject unknown properties for every tool", () => {
        for (const name of FORMAL_TOOL_NAMES) {
            const input = {...VALID_INPUTS[name], unexpected: "SECRET_CANARY"},
                result = validateToolInput(input, TOOL_CONTRACTS[name].inputSchema);
            assert.equal(result.valid, false, name);
        }
    }),

    it("WebMCPToolDefinitions: should enforce unambiguous Recipe anchors", () => {
        const schema = TOOL_CONTRACTS[TOOL_NAME.APPLY_RECIPE_PATCH].inputSchema,
            insert = {
                expectedRevision: 2,
                changes: [{
                    type: "insert",
                    operation: "To Base64",
                    beforeStepId: "step-1",
                    afterStepId: "step-2",
                }],
            },
            move = {
                expectedRevision: 2,
                changes: [{
                    type: "move",
                    stepId: "step-3",
                    beforeStepId: "step-1",
                    afterStepId: "step-2",
                }],
            };

        assert.equal(validateToolInput(insert, schema).valid, false);
        assert.equal(validateToolInput(move, schema).valid, false);
    }),

    it("WebMCPToolDefinitions: should match annotations to observable behavior", () => {
        assert.deepStrictEqual(TOOL_CONTRACTS[TOOL_NAME.SEARCH_OPERATIONS].annotations, {
            readOnlyHint: true,
            untrustedContentHint: true,
        });
        assert.deepStrictEqual(TOOL_CONTRACTS[TOOL_NAME.GET_RECIPE_STATE].annotations, {
            readOnlyHint: true,
            untrustedContentHint: true,
        });
        assert.deepStrictEqual(TOOL_CONTRACTS[TOOL_NAME.APPLY_RECIPE_PATCH].annotations, {
            readOnlyHint: false,
            untrustedContentHint: false,
        });
        assert.deepStrictEqual(TOOL_CONTRACTS[TOOL_NAME.BAKE_RECIPE].annotations, {
            readOnlyHint: false,
            untrustedContentHint: false,
        });
        assert.deepStrictEqual(TOOL_CONTRACTS[TOOL_NAME.INSPECT_OUTPUT].annotations, {
            readOnlyHint: false,
            untrustedContentHint: true,
        });
    }),

    it("WebMCPToolDefinitions: should keep capability profiles cumulative", () => {
        assert.deepStrictEqual(BUILD_PROFILES[PROFILE_NAME.READINESS].toolNames, [READINESS_TOOL_NAME]);
        assert.deepStrictEqual(BUILD_PROFILES[PROFILE_NAME.RECIPE].toolNames, FORMAL_TOOL_NAMES.slice(0, 4));
        assert.deepStrictEqual(BUILD_PROFILES[PROFILE_NAME.RUN].toolNames, FORMAL_TOOL_NAMES.slice(0, 5));
        assert.deepStrictEqual(BUILD_PROFILES[PROFILE_NAME.ANALYSIS].toolNames, FORMAL_TOOL_NAMES);
        assertDeeplyFrozen(BUILD_PROFILES);
    }),

    it("WebMCPToolDefinitions: should expose the candidate Run capability", () => {
        assert.equal(ACTIVE_BUILD_PROFILE.name, PROFILE_NAME.RUN);
        assert.deepStrictEqual(ACTIVE_BUILD_PROFILE.toolNames, FORMAL_TOOL_NAMES.slice(0, 5));
        assert.deepStrictEqual(ACTIVE_BUILD_PROFILE.stateFields, [
            "sessionEpoch",
            "recipeRevision",
            "executionCapability",
            "inputTabId",
            "inputGeneration",
            "inputRevision",
            "executionOptionsVersion",
            "viewVersion",
            "outputTabId",
            "outputGeneration",
            "outputVersion",
            "bakeId",
            "terminalState",
        ]);
    }),

]);
