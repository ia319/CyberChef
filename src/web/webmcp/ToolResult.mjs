const TOOL_RESULT_VERSION = "1";
const TOOL_RESULT_MAX_CHARS = 1500;
const ERROR_MESSAGE_MAX_CHARS = 160;

const TOOL_ERROR_CODE = Object.freeze({
    COLLABORATION_DISABLED: "COLLABORATION_DISABLED",
    SESSION_ENDED: "SESSION_ENDED",
    INVALID_REQUEST: "INVALID_REQUEST",
    INVALID_PATCH: "INVALID_PATCH",
    STALE_RECIPE: "STALE_RECIPE",
    UNKNOWN_STEP: "UNKNOWN_STEP",
    UNSUPPORTED_INGREDIENT: "UNSUPPORTED_INGREDIENT",
    UNREVIEWED_OPERATION: "UNREVIEWED_OPERATION",
    RISK_BLOCKED: "RISK_BLOCKED",
    USER_ACTION_REQUIRED: "USER_ACTION_REQUIRED",
    TAB_MISMATCH: "TAB_MISMATCH",
    BAKE_BUSY: "BAKE_BUSY",
    BAKE_PAUSED: "BAKE_PAUSED",
    BAKE_FAILED: "BAKE_FAILED",
    BAKE_CANCELLED: "BAKE_CANCELLED",
    BAKE_TIMEOUT: "BAKE_TIMEOUT",
    STALE_BAKE_RESULT: "STALE_BAKE_RESULT",
    ANALYSIS_EMPTY: "ANALYSIS_EMPTY",
    ANALYSIS_FAILED: "ANALYSIS_FAILED",
    ANALYSIS_TIMEOUT: "ANALYSIS_TIMEOUT",
    ANALYSIS_BUDGET_EXHAUSTED: "ANALYSIS_BUDGET_EXHAUSTED",
    STALE_OUTPUT_ANALYSIS: "STALE_OUTPUT_ANALYSIS",
    RESULT_TOO_LARGE: "RESULT_TOO_LARGE",
    INTERNAL_ERROR: "INTERNAL_ERROR",
});

const defineError = (message, retryable, userActionRequired) => {
    if (message.length > ERROR_MESSAGE_MAX_CHARS) {
        throw new RangeError("WebMCP error message exceeds its fixed budget");
    }

    return Object.freeze({
        message,
        retryable,
        userActionRequired,
    });
};

const ERROR_DEFINITIONS = Object.freeze({
    [TOOL_ERROR_CODE.COLLABORATION_DISABLED]: defineError("Start Recipe collaboration before using this tool.", true, true),
    [TOOL_ERROR_CODE.SESSION_ENDED]: defineError("The Recipe collaboration session ended.", true, true),
    [TOOL_ERROR_CODE.INVALID_REQUEST]: defineError("The tool request is invalid.", true, false),
    [TOOL_ERROR_CODE.INVALID_PATCH]: defineError("The Recipe patch is invalid.", true, false),
    [TOOL_ERROR_CODE.STALE_RECIPE]: defineError("The Recipe changed. Read its current state before applying another patch.", true, false),
    [TOOL_ERROR_CODE.UNKNOWN_STEP]: defineError("The requested Recipe step does not exist in the current revision.", true, false),
    [TOOL_ERROR_CODE.UNSUPPORTED_INGREDIENT]: defineError("This Operation argument type is not supported for Agent changes.", false, true),
    [TOOL_ERROR_CODE.UNREVIEWED_OPERATION]: defineError("This Operation has not been approved for Agent changes.", false, true),
    [TOOL_ERROR_CODE.RISK_BLOCKED]: defineError("The requested action is blocked by the Recipe safety policy.", false, true),
    [TOOL_ERROR_CODE.USER_ACTION_REQUIRED]: defineError("The user must complete this action in CyberChef.", false, true),
    [TOOL_ERROR_CODE.TAB_MISMATCH]: defineError("The active Input and Output tabs do not identify the same workspace target.", true, true),
    [TOOL_ERROR_CODE.BAKE_BUSY]: defineError("CyberChef is running a different Recipe target.", true, false),
    [TOOL_ERROR_CODE.BAKE_PAUSED]: defineError("The Recipe paused at a breakpoint.", false, true),
    [TOOL_ERROR_CODE.BAKE_FAILED]: defineError("The Recipe did not complete successfully.", true, false),
    [TOOL_ERROR_CODE.BAKE_CANCELLED]: defineError("The Recipe run was cancelled.", false, true),
    [TOOL_ERROR_CODE.BAKE_TIMEOUT]: defineError("The Recipe run exceeded its time budget.", true, false),
    [TOOL_ERROR_CODE.STALE_BAKE_RESULT]: defineError("The Recipe result no longer matches the current workspace target.", true, false),
    [TOOL_ERROR_CODE.ANALYSIS_EMPTY]: defineError("The current Output did not produce an approved analysis signal.", false, true),
    [TOOL_ERROR_CODE.ANALYSIS_FAILED]: defineError("The current Output could not be analysed.", true, false),
    [TOOL_ERROR_CODE.ANALYSIS_TIMEOUT]: defineError("Output analysis exceeded its time budget.", true, false),
    [TOOL_ERROR_CODE.ANALYSIS_BUDGET_EXHAUSTED]: defineError("The collaboration session has reached its Output analysis budget.", false, true),
    [TOOL_ERROR_CODE.STALE_OUTPUT_ANALYSIS]: defineError("The analysis no longer matches the current Output.", true, false),
    [TOOL_ERROR_CODE.RESULT_TOO_LARGE]: defineError("The tool result exceeds its response budget.", true, false),
    [TOOL_ERROR_CODE.INTERNAL_ERROR]: defineError("CyberChef could not complete the tool request.", true, false),
});

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);


/**
 * Rejects values that JSON would omit, coerce, or execute while serializing.
 *
 * @param {*} value - Candidate result value.
 * @param {WeakSet<Object>} ancestors - Objects in the current traversal path.
 */
function assertJsonSafe(value, ancestors) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;

    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new TypeError("Non-finite numbers are not JSON-safe");
        return;
    }

    if (typeof value !== "object") {
        throw new TypeError("Unsupported tool result value");
    }

    if (ancestors.has(value)) throw new TypeError("Cyclic tool result");
    ancestors.add(value);

    if (Array.isArray(value)) {
        if (Reflect.ownKeys(value).length !== value.length + 1 || Object.keys(value).length !== value.length) {
            throw new TypeError("Sparse or extended arrays are not JSON-safe");
        }

        for (const item of value) assertJsonSafe(item, ancestors);
        ancestors.delete(value);
        return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("Class instances are not JSON-safe tool results");
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key];
        if (typeof key !== "string" || FORBIDDEN_OBJECT_KEYS.has(key) ||
            !descriptor.enumerable || !("value" in descriptor)) {
            throw new TypeError("Unsupported tool result property");
        }
        assertJsonSafe(descriptor.value, ancestors);
    }

    ancestors.delete(value);
}


/**
 * Builds a fixed error result without accepting dynamic error text.
 *
 * @param {string} code - Error code from TOOL_ERROR_CODE.
 * @returns {Object} A JSON-safe error envelope.
 */
function buildErrorResult(code) {
    const definition = Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, code) ?
        ERROR_DEFINITIONS[code] : ERROR_DEFINITIONS[TOOL_ERROR_CODE.INTERNAL_ERROR];
    const safeCode = Object.prototype.hasOwnProperty.call(ERROR_DEFINITIONS, code) ?
        code : TOOL_ERROR_CODE.INTERNAL_ERROR;

    return {
        version: TOOL_RESULT_VERSION,
        ok: false,
        error: {
            code: safeCode,
            message: definition.message,
            retryable: definition.retryable,
            userActionRequired: definition.userActionRequired,
        },
    };
}


/**
 * Returns a detached JSON-safe result or a fixed boundary error.
 *
 * @param {Object} result - Result envelope to validate and copy.
 * @returns {Object} A bounded tool result.
 */
function finalizeToolResult(result) {
    let serialized;

    try {
        assertJsonSafe(result, new WeakSet());
        serialized = JSON.stringify(result);
    } catch (err) {
        return buildErrorResult(TOOL_ERROR_CODE.INTERNAL_ERROR);
    }

    if (serialized.length > TOOL_RESULT_MAX_CHARS) {
        return buildErrorResult(TOOL_ERROR_CODE.RESULT_TOO_LARGE);
    }

    return JSON.parse(serialized);
}


/**
 * Creates a versioned success result.
 *
 * @param {Object} data - Tool-specific result data.
 * @param {Object} [state] - Optional version and provenance state.
 * @returns {Object} A bounded tool result.
 */
function createSuccessResult(data, state) {
    const result = {
        version: TOOL_RESULT_VERSION,
        ok: true,
        data,
    };

    if (typeof state !== "undefined") result.state = state;

    return finalizeToolResult(result);
}


/**
 * Creates an error result from the fixed error catalog.
 *
 * @param {string} code - Error code from TOOL_ERROR_CODE.
 * @returns {Object} A JSON-safe error envelope.
 */
function createErrorResult(code) {
    return buildErrorResult(code);
}

export {
    ERROR_DEFINITIONS,
    ERROR_MESSAGE_MAX_CHARS,
    TOOL_ERROR_CODE,
    TOOL_RESULT_MAX_CHARS,
    TOOL_RESULT_VERSION,
    createErrorResult,
    createSuccessResult,
};
