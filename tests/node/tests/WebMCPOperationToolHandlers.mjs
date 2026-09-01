import assert from "assert";
import {
    OPERATION_TOOL_HANDLERS,
} from "../../../src/web/webmcp/OperationToolHandlers.mjs";
import {executeTool} from "../../../src/web/webmcp/ToolExecutor.mjs";
import {
    TOOL_CONTRACTS,
    TOOL_NAME,
} from "../../../src/web/webmcp/ToolDefinitions.mjs";
import {
    TOOL_ERROR_CODE,
    TOOL_RESULT_MAX_CHARS,
} from "../../../src/web/webmcp/ToolResult.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPOperationToolHandlers: should search static metadata with stable capability pagination", async () => {
        const contract = TOOL_CONTRACTS[TOOL_NAME.SEARCH_OPERATIONS],
            handler = OPERATION_TOOL_HANDLERS[TOOL_NAME.SEARCH_OPERATIONS],
            firstPage = await executeTool(contract, handler, {
                query: "base64",
                limit: 2,
                offset: 0,
            }),
            secondPage = await executeTool(contract, handler, {
                query: "base64",
                limit: 2,
                offset: firstPage.data.nextOffset,
            });

        assert.equal(firstPage.ok, true);
        assert.deepStrictEqual(firstPage.data.items.map(item => item.name), [
            "To Base64",
            "From Base64",
        ]);
        assert.equal(firstPage.data.items[0].reviewStatus, "safe");
        assert(firstPage.data.items[0].supportedActions.includes("insert"));
        assert.equal(firstPage.data.items.length, 2);
        assert.equal(firstPage.data.nextOffset, 2);
        assert.equal(secondPage.data.offset, 2);
        assert.equal(secondPage.data.items.some(item => item.name === "To Base64"), false);
    }),

    it("WebMCPOperationToolHandlers: should keep broad search results inside the shared budget", async () => {
        const result = await executeTool(
            TOOL_CONTRACTS[TOOL_NAME.SEARCH_OPERATIONS],
            OPERATION_TOOL_HANDLERS[TOOL_NAME.SEARCH_OPERATIONS],
            {query: "to", limit: 10, offset: 0}
        );

        assert.equal(result.ok, true);
        assert(result.data.items.length > 0);
        assert(result.data.items.length <= 10);
        assert(JSON.stringify(result).length <= TOOL_RESULT_MAX_CHARS);
    }),

    it("WebMCPOperationToolHandlers: should return static defaults, constraints, and permissions", async () => {
        const result = await executeTool(
            TOOL_CONTRACTS[TOOL_NAME.GET_OPERATION_DETAILS],
            OPERATION_TOOL_HANDLERS[TOOL_NAME.GET_OPERATION_DETAILS],
            {
                name: "To Base64",
                argumentOffset: 0,
                argumentLimit: 1,
                optionOffset: 0,
                optionLimit: 2,
            }
        );

        assert.equal(result.ok, true);
        assert.equal(result.data.name, "To Base64");
        assert.equal(result.data.reviewStatus, "safe");
        assert(result.data.supportedActions.includes("setArgument"));
        assert.equal(result.data.arguments.length, 1);
        assert.deepStrictEqual(result.data.arguments[0].defaultValue, "A-Za-z0-9+/=");
        assert.equal(result.data.arguments[0].constraints.profileRule, "enum");
        assert.deepStrictEqual(result.data.options.map(option => option.value), [
            "A-Za-z0-9+/=",
            "A-Za-z0-9-_",
        ]);
        assert(JSON.stringify(result).length <= TOOL_RESULT_MAX_CHARS);
    }),

    it("WebMCPOperationToolHandlers: should expose reviewed data-format constraints", async () => {
        const contract = TOOL_CONTRACTS[TOOL_NAME.GET_OPERATION_DETAILS],
            handler = OPERATION_TOOL_HANDLERS[TOOL_NAME.GET_OPERATION_DETAILS],
            result = await executeTool(contract, handler, {
                name: "To Bech32",
                argumentOffset: 0,
                argumentLimit: 1,
                optionOffset: 0,
                optionLimit: 1,
            }),
            encoding = await executeTool(contract, handler, {
                name: "To Bech32",
                argumentOffset: 1,
                argumentLimit: 1,
                optionOffset: 0,
                optionLimit: 1,
            }),
            witness = await executeTool(contract, handler, {
                name: "To Bech32",
                argumentOffset: 4,
                argumentLimit: 1,
                optionOffset: 0,
                optionLimit: 1,
            });

        assert.equal(result.ok, true);
        assert.equal(result.data.reviewStatus, "safe");
        assert.equal(result.data.agentBakeAllowed, true);
        assert(result.data.supportedActions.includes("insert"));
        assert.equal(result.data.arguments[0].constraints.profileRule, "string");
        assert.equal(encoding.data.arguments[0].index, 1);
        assert.equal(encoding.data.arguments[0].constraints.profileRule, "conditional");
        assert.equal(witness.data.arguments[0].index, 4);
        assert.equal(witness.data.arguments[0].constraints.profileRule, "conditional");
    }),

    it("WebMCPOperationToolHandlers: should distinguish HOTP approval from direct Bake access", async () => {
        const result = await executeTool(
            TOOL_CONTRACTS[TOOL_NAME.GET_OPERATION_DETAILS],
            OPERATION_TOOL_HANDLERS[TOOL_NAME.GET_OPERATION_DETAILS],
            {name: "Generate HOTP"}
        );

        assert.equal(result.ok, true);
        assert.equal(result.data.reviewStatus, "constrained");
        assert.equal(result.data.mutationPolicy, "userActionRequired");
        assert.equal(result.data.agentBakePolicy, "userActionRequired");
        assert.equal(result.data.agentBakeAllowed, false);
        assert(result.data.supportedActions.includes("insert"));
        assert.equal(result.data.arguments[0].constraints.maximumCodePoints, 128);
    }),

    it("WebMCPOperationToolHandlers: should paginate large argument sets within the result budget", async () => {
        const result = await executeTool(
            TOOL_CONTRACTS[TOOL_NAME.GET_OPERATION_DETAILS],
            OPERATION_TOOL_HANDLERS[TOOL_NAME.GET_OPERATION_DETAILS],
            {
                name: "Colossus",
                argumentOffset: 0,
                argumentLimit: 10,
                optionOffset: 0,
                optionLimit: 50,
            }
        );

        assert.equal(result.ok, true);
        assert.equal(result.data.argumentTotal, 57);
        assert(result.data.arguments.length > 0);
        assert(result.data.arguments.length <= 10);
        assert.equal(result.data.nextArgumentOffset, result.data.arguments.length);
        assert(JSON.stringify(result).length <= TOOL_RESULT_MAX_CHARS);
    }),

    it("WebMCPOperationToolHandlers: should contain unknown Operation names", async () => {
        const operationCanary = "SECRET_OPERATION_CANARY",
            result = await executeTool(
                TOOL_CONTRACTS[TOOL_NAME.GET_OPERATION_DETAILS],
                OPERATION_TOOL_HANDLERS[TOOL_NAME.GET_OPERATION_DETAILS],
                {name: operationCanary}
            ),
            serialized = JSON.stringify(result);

        assert.equal(result.error.code, TOOL_ERROR_CODE.UNKNOWN_OPERATION);
        assert.equal(serialized.includes(operationCanary), false);
    }),
]);
