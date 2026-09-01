import { validateToolInput } from "./ToolInput.mjs";
import {
    ERROR_DEFINITIONS,
    TOOL_ERROR_CODE,
    createErrorResult,
    createSuccessResult,
} from "./ToolResult.mjs";


/**
 * Separates reviewed handler failures from unexpected exceptions.
 */
class ToolExecutionError extends Error {

    /**
     * Preserves a reviewed public error code and optional bounded context.
     *
     * @param {string} code - Error code from TOOL_ERROR_CODE.
     * @param {Object|undefined} [context] - Reviewed Bake or approval context.
     */
    constructor(code, context) {
        super("WebMCP tool execution failed");
        this.name = "ToolExecutionError";
        this.code = Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, code) ?
            code : TOOL_ERROR_CODE.INTERNAL_ERROR;
        this.context = context;
    }
}


/**
 * Keeps validation and result shaping consistent across registered handlers.
 *
 * @param {Object} contract - Fixed tool contract containing an input schema.
 * @param {Function} handler - Trusted handler that returns data and optional state.
 * @param {*} input - Host-provided tool input.
 * @param {ToolExecuteCallbackOptions|undefined} options - Host invocation options.
 * @returns {Promise<Object>} A bounded versioned tool result.
 */
async function executeTool(contract, handler, input, options) {
    const signal = options && options.signal;

    if (signal && signal.aborted) throw signal.reason;

    const validation = validateToolInput(input, contract.inputSchema);
    if (!validation.valid) return createErrorResult(TOOL_ERROR_CODE.INVALID_REQUEST);

    try {
        const handlerResult = await handler(validation.value, signal);

        if (signal && signal.aborted) throw signal.reason;
        if (!handlerResult || typeof handlerResult !== "object" ||
            !Object.prototype.hasOwnProperty.call(handlerResult, "data")) {
            return createErrorResult(TOOL_ERROR_CODE.INTERNAL_ERROR);
        }

        return createSuccessResult(handlerResult.data, handlerResult.state);
    } catch (err) {
        if (signal && signal.aborted) throw signal.reason;
        if (err instanceof ToolExecutionError) return createErrorResult(err.code, err.context);
        return createErrorResult(TOOL_ERROR_CODE.INTERNAL_ERROR);
    }
}

export {
    ToolExecutionError,
    executeTool,
};
