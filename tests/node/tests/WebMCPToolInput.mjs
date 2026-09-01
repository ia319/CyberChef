import assert from "assert";
import {
    TOOL_INPUT_MAX_CHARS,
    TOOL_INPUT_MAX_DEPTH,
    TOOL_INPUT_MAX_NODES,
    validateToolInput,
} from "../../../src/web/webmcp/ToolInput.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const SEARCH_SCHEMA = Object.freeze({
    type: "object",
    properties: Object.freeze({
        query: Object.freeze({type: "string", minLength: 1, maxLength: 4}),
        limit: Object.freeze({type: "integer", minimum: 1, maximum: 10}),
    }),
    required: Object.freeze(["query"]),
    additionalProperties: false,
});


TestRegister.addApiTests([
    it("WebMCPToolInput: should validate and detach supported input", () => {
        const input = {query: "hex", limit: 5},
            result = validateToolInput(input, SEARCH_SCHEMA);

        input.query = "url";

        assert.deepStrictEqual(result, {
            valid: true,
            value: {query: "hex", limit: 5},
        });
    }),

    it("WebMCPToolInput: should reject missing, unknown, and invalid properties", () => {
        const invalidInputs = [
            {},
            {query: "hex", extra: true},
            {query: "hexadecimal"},
            {query: "hex", limit: 0},
            {query: "hex", limit: 1.5},
        ];

        for (const input of invalidInputs) {
            assert.deepStrictEqual(validateToolInput(input, SEARCH_SCHEMA), {valid: false});
        }
    }),

    it("WebMCPToolInput: should count Unicode code points for string limits", () => {
        assert.equal(validateToolInput({query: "🧑‍💻a"}, SEARCH_SCHEMA).valid, true);
        assert.equal(validateToolInput({query: "🧑‍💻ab"}, SEARCH_SCHEMA).valid, false);
    }),

    it("WebMCPToolInput: should enforce fixed string patterns", () => {
        const schema = {
            type: "object",
            properties: {
                requestId: {
                    type: "string",
                    minLength: 16,
                    maxLength: 128,
                    pattern: "^[A-Za-z0-9_-]+$",
                },
            },
            required: ["requestId"],
            additionalProperties: false,
        };

        assert.equal(validateToolInput({requestId: "approval-request-1"}, schema).valid, true);
        assert.equal(validateToolInput({requestId: "approval request!"}, schema).valid, false);
    }),

    it("WebMCPToolInput: should enforce the total serialized input budget", () => {
        const schema = {
                type: "object",
                properties: {
                    value: {type: "string", maxLength: TOOL_INPUT_MAX_CHARS * 2},
                },
                required: ["value"],
                additionalProperties: false,
            },
            input = {value: "S".repeat(TOOL_INPUT_MAX_CHARS)};

        assert.deepStrictEqual(validateToolInput(input, schema), {valid: false});
    }),

    it("WebMCPToolInput: should reject unsafe objects without invoking accessors", () => {
        let getterCalled = false;
        const accessor = {};
        Object.defineProperty(accessor, "query", {
            enumerable: true,
            get: () => {
                getterCalled = true;
                return "hex";
            },
        });

        const cycle = {query: "hex"};
        cycle.self = cycle;

        for (const input of [accessor, cycle, new Map(), {query: BigInt(1)}]) {
            assert.deepStrictEqual(validateToolInput(input, SEARCH_SCHEMA), {valid: false});
        }
        assert.equal(getterCalled, false);
    }),

    it("WebMCPToolInput: should reject structures beyond the depth budget", () => {
        const schema = {type: "object", properties: {}, additionalProperties: true},
            input = {};
        let current = input;

        for (let i = 0; i <= TOOL_INPUT_MAX_DEPTH; i++) {
            current.child = {};
            current = current.child;
        }

        assert.deepStrictEqual(validateToolInput(input, schema), {valid: false});
    }),

    it("WebMCPToolInput: should reject structures beyond the node budget", () => {
        const schema = {
                type: "object",
                properties: {
                    values: {
                        type: "array",
                        maxItems: TOOL_INPUT_MAX_NODES,
                        items: {type: "integer"},
                    },
                },
                required: ["values"],
                additionalProperties: false,
            },
            input = {values: Array(TOOL_INPUT_MAX_NODES).fill(0)};

        assert.deepStrictEqual(validateToolInput(input, schema), {valid: false});
    }),

    it("WebMCPToolInput: should support command variants without accepting ambiguous matches", () => {
        const schema = {
            oneOf: [
                {
                    type: "object",
                    properties: {
                        type: {type: "string", const: "remove"},
                        stepId: {type: "string", minLength: 1, maxLength: 64},
                    },
                    required: ["type", "stepId"],
                    additionalProperties: false,
                },
                {
                    type: "object",
                    properties: {
                        type: {type: "string", const: "disable"},
                        stepId: {type: "string", minLength: 1, maxLength: 64},
                    },
                    required: ["type", "stepId"],
                    additionalProperties: false,
                },
            ],
        };

        assert.equal(validateToolInput({type: "remove", stepId: "step-1"}, schema).valid, true);
        assert.equal(validateToolInput({type: "enable", stepId: "step-1"}, schema).valid, false);

        const ambiguousSchema = {
            oneOf: [
                {
                    type: "object",
                    properties: {stepId: {type: "string", minLength: 1}},
                    required: ["stepId"],
                    additionalProperties: false,
                },
                {
                    type: "object",
                    properties: {stepId: {type: "string", maxLength: 64}},
                    required: ["stepId"],
                    additionalProperties: false,
                },
            ],
        };

        assert.equal(validateToolInput({stepId: "step-1"}, ambiguousSchema).valid, false);
    }),
]);
