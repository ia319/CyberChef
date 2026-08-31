import assert from "assert";
import {
    ERROR_DEFINITIONS,
    ERROR_MESSAGE_MAX_CHARS,
    TOOL_ERROR_CODE,
    TOOL_RESULT_MAX_CHARS,
    createErrorResult,
    createSuccessResult,
    isSuccessResultWithinBudget,
} from "../../../src/web/webmcp/ToolResult.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPToolResult: should create a detached success envelope", () => {
        const data = {items: ["To Base64"]},
            state = {recipeRevision: 3},
            result = createSuccessResult(data, state);

        data.items.push("From Base64");
        state.recipeRevision = 4;

        assert.deepStrictEqual(result, {
            version: "1",
            ok: true,
            data: {items: ["To Base64"]},
            state: {recipeRevision: 3},
        });
    }),

    it("WebMCPToolResult: should create fixed error envelopes", () => {
        const result = createErrorResult(TOOL_ERROR_CODE.STALE_RECIPE);

        assert.deepStrictEqual(result, {
            version: "1",
            ok: false,
            error: {
                code: "STALE_RECIPE",
                message: "The Recipe changed. Read its current state before applying another patch.",
                retryable: true,
                userActionRequired: false,
            },
        });
    }),

    it("WebMCPToolResult: should replace unknown errors with a fixed internal error", () => {
        const result = createErrorResult("SECRET_CANARY");

        assert.equal(result.error.code, TOOL_ERROR_CODE.INTERNAL_ERROR);
        assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
    }),

    it("WebMCPToolResult: should allow only reviewed terminal Bake context", () => {
        const state = {
                sessionEpoch: 3,
                recipeRevision: 4,
                executionCapability: "AGENT_BAKE_AVAILABLE",
                inputTabId: 1,
                inputGeneration: "2:1",
                inputRevision: 5,
                executionOptionsVersion: 1,
                viewVersion: 6,
                outputTabId: 1,
                outputGeneration: 7,
                outputVersion: 8,
                bakeId: 9,
                terminalState: "paused",
            },
            result = createErrorResult(TOOL_ERROR_CODE.BAKE_PAUSED, {
                stepId: "recipe-step-2",
                state,
            });

        state.bakeId = 10;
        assert.equal(result.error.code, TOOL_ERROR_CODE.BAKE_PAUSED);
        assert.equal(result.error.stepId, "recipe-step-2");
        assert.equal(result.state.bakeId, 9);

        const unsafe = createErrorResult(TOOL_ERROR_CODE.BAKE_FAILED, {
            stepId: null,
            state: {...state, rawOutput: "SECRET_CANARY"},
        });
        assert.equal(unsafe.error.code, TOOL_ERROR_CODE.INTERNAL_ERROR);
        assert.equal(JSON.stringify(unsafe).includes("SECRET_CANARY"), false);
    }),

    it("WebMCPToolResult: should reject values that JSON would alter or omit", () => {
        const cycle = {};
        cycle.self = cycle;

        const unsafeValues = [
            new Error("SECRET_CANARY"),
            new Map([["value", "SECRET_CANARY"]]),
            new Set(["SECRET_CANARY"]),
            BigInt(1),
            undefined,
            Symbol("SECRET_CANARY"),
            () => "SECRET_CANARY",
            Number.NaN,
            cycle,
        ];

        for (const value of unsafeValues) {
            const result = createSuccessResult({value});
            assert.equal(result.error.code, TOOL_ERROR_CODE.INTERNAL_ERROR);
            assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
        }
    }),

    it("WebMCPToolResult: should reject accessors and forbidden object keys", () => {
        const accessor = {};
        Object.defineProperty(accessor, "value", {
            enumerable: true,
            get: () => "SECRET_CANARY",
        });

        const forbiddenKey = Object.create(null);
        forbiddenKey.constructor = "SECRET_CANARY";

        for (const value of [accessor, forbiddenKey]) {
            const result = createSuccessResult({value});
            assert.equal(result.error.code, TOOL_ERROR_CODE.INTERNAL_ERROR);
            assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
        }
    }),

    it("WebMCPToolResult: should return a complete error when the result exceeds its budget", () => {
        const result = createSuccessResult({value: "S".repeat(TOOL_RESULT_MAX_CHARS)}),
            serialized = JSON.stringify(result);

        assert.equal(result.error.code, TOOL_ERROR_CODE.RESULT_TOO_LARGE);
        assert(serialized.length <= TOOL_RESULT_MAX_CHARS);
        assert.equal(serialized.includes("SSSSSSSS"), false);
    }),

    it("WebMCPToolResult: should measure the complete success envelope against its budget", () => {
        assert.equal(isSuccessResultWithinBudget({value: "small"}), true);
        assert.equal(isSuccessResultWithinBudget({value: "S".repeat(TOOL_RESULT_MAX_CHARS)}), false);
        assert.equal(isSuccessResultWithinBudget({value: undefined}), false);
    }),

    it("WebMCPToolResult: should keep every fixed error within its message budget", () => {
        for (const [code, definition] of Object.entries(ERROR_DEFINITIONS)) {
            assert.equal(code, TOOL_ERROR_CODE[code]);
            assert(definition.message.length <= ERROR_MESSAGE_MAX_CHARS);
            assert.equal(typeof definition.retryable, "boolean");
            assert.equal(typeof definition.userActionRequired, "boolean");
            assert.doesNotThrow(() => JSON.stringify(createErrorResult(code)));
        }
    }),
]);
