import assert from "assert";
import {
    ToolExecutionError,
    executeTool,
} from "../../../src/web/webmcp/ToolExecutor.mjs";
import { TOOL_ERROR_CODE } from "../../../src/web/webmcp/ToolResult.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const CONTRACT = Object.freeze({
    inputSchema: Object.freeze({
        type: "object",
        properties: Object.freeze({
            query: Object.freeze({type: "string", minLength: 1, maxLength: 8}),
        }),
        required: Object.freeze(["query"]),
        additionalProperties: false,
    }),
});


TestRegister.addApiTests([
    it("WebMCPToolExecutor: should validate input and return a versioned result", async () => {
        const input = {query: "base64"};
        let handlerInput;

        const result = await executeTool(CONTRACT, async value => {
            handlerInput = value;
            return {
                data: {matches: ["To Base64"]},
                state: {catalogVersion: 1},
            };
        }, input);

        input.query = "hex";

        assert.notStrictEqual(handlerInput, input);
        assert.deepStrictEqual(handlerInput, {query: "base64"});
        assert.deepStrictEqual(result, {
            version: "1",
            ok: true,
            data: {matches: ["To Base64"]},
            state: {catalogVersion: 1},
        });
    }),

    it("WebMCPToolExecutor: should reject invalid input before calling the handler", async () => {
        let handlerCalled = false;
        const result = await executeTool(CONTRACT, async () => {
            handlerCalled = true;
            return {data: {}};
        }, {query: "base64", unexpected: "SECRET_CANARY"});

        assert.equal(handlerCalled, false);
        assert.equal(result.error.code, TOOL_ERROR_CODE.INVALID_REQUEST);
        assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
    }),

    it("WebMCPToolExecutor: should map expected failures through the fixed error catalog", async () => {
        const result = await executeTool(CONTRACT, async () => {
            throw new ToolExecutionError(TOOL_ERROR_CODE.STALE_RECIPE);
        }, {query: "base64"});

        assert.equal(result.error.code, TOOL_ERROR_CODE.STALE_RECIPE);
    }),

    it("WebMCPToolExecutor: should preserve reviewed terminal Bake context", async () => {
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
                terminalState: "failed",
            },
            result = await executeTool(CONTRACT, async () => {
                throw new ToolExecutionError(TOOL_ERROR_CODE.BAKE_FAILED, {
                    stepId: "recipe-step-2",
                    state,
                });
            }, {query: "base64"});

        assert.equal(result.error.code, TOOL_ERROR_CODE.BAKE_FAILED);
        assert.equal(result.error.stepId, "recipe-step-2");
        assert.deepStrictEqual(result.state, state);
    }),

    it("WebMCPToolExecutor: should contain an unrecognized expected error code", async () => {
        const result = await executeTool(CONTRACT, async () => {
            throw new ToolExecutionError("SECRET_CANARY");
        }, {query: "base64"});

        assert.equal(result.error.code, TOOL_ERROR_CODE.INTERNAL_ERROR);
        assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
    }),

    it("WebMCPToolExecutor: should contain unknown handler failures", async () => {
        const result = await executeTool(CONTRACT, async () => {
            throw new Error("SECRET_CANARY");
        }, {query: "base64"});

        assert.equal(result.error.code, TOOL_ERROR_CODE.INTERNAL_ERROR);
        assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
    }),

    it("WebMCPToolExecutor: should contain malformed and oversized handler results", async () => {
        const malformed = await executeTool(CONTRACT, async () => ({}), {query: "base64"}),
            oversized = await executeTool(CONTRACT, async () => ({
                data: {value: "S".repeat(2000)},
            }), {query: "base64"});

        assert.equal(malformed.error.code, TOOL_ERROR_CODE.INTERNAL_ERROR);
        assert.equal(oversized.error.code, TOOL_ERROR_CODE.RESULT_TOO_LARGE);
    }),

    it("WebMCPToolExecutor: should reject an invocation cancelled before execution", async () => {
        let handlerCalled = false;
        const controller = new AbortController();
        controller.abort();

        await assert.rejects(executeTool(CONTRACT, async () => {
            handlerCalled = true;
            return {data: {}};
        }, {query: "base64"}, {signal: controller.signal}), err => err.name === "AbortError");
        assert.equal(handlerCalled, false);
    }),

    it("WebMCPToolExecutor: should discard a result after invocation cancellation", async () => {
        const controller = new AbortController();
        let finishHandler,
            handlerSignal;
        const handlerPending = new Promise(resolve => {
                finishHandler = resolve;
            }),
            execution = executeTool(CONTRACT, async (input, signal) => {
                handlerSignal = signal;
                await handlerPending;
                return {data: {status: "late"}};
            }, {query: "base64"}, {signal: controller.signal});

        controller.abort();
        finishHandler();

        await assert.rejects(execution, err => err.name === "AbortError");
        assert.strictEqual(handlerSignal, controller.signal);
    }),
]);
