const AGENT_BAKE_CAPABILITY = "AGENT_BAKE_AVAILABLE";
const RECIPE_STEP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const INPUT_GENERATION_PATTERN = /^\d+:\d+$/;
const RECIPE_STEP_ID_MAX_CHARS = 64;
const BAKE_ERROR_CODES = new Set([
    "BAKE_PAUSED",
    "BAKE_FAILED",
    "BAKE_CANCELLED",
    "BAKE_TIMEOUT",
    "STALE_BAKE_RESULT",
]);
const BAKE_TERMINAL_STATES = new Set([
    "cancelled",
    "failed",
    "paused",
    "superseded",
    "timedOut",
]);
const BAKE_STATE_FIELDS = Object.freeze([
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


/**
 * Checks a non-negative in-memory identity or version.
 *
 * @param {*} value - Candidate numeric identity.
 * @returns {boolean} Whether the value is a non-negative safe integer.
 */
function isNonNegativeIdentity(value) {
    return Number.isSafeInteger(value) && value >= 0;
}


/**
 * Validates the complete content-free state allowed on terminal Bake errors.
 *
 * @param {*} state - Candidate Bake provenance state.
 * @returns {boolean} Whether the state contains only reviewed identity fields.
 */
function isBakeErrorState(state) {
    if (!state || typeof state !== "object" || Array.isArray(state) ||
        Object.getPrototypeOf(state) !== Object.prototype ||
        Object.keys(state).length !== BAKE_STATE_FIELDS.length ||
        !BAKE_STATE_FIELDS.every(field => Object.prototype.hasOwnProperty.call(state, field))) {
        return false;
    }

    return (isNonNegativeIdentity(state.sessionEpoch) ||
            typeof state.sessionEpoch === "string" && state.sessionEpoch.length > 0 &&
                state.sessionEpoch.length <= RECIPE_STEP_ID_MAX_CHARS &&
                RECIPE_STEP_ID_PATTERN.test(state.sessionEpoch)) &&
        isNonNegativeIdentity(state.recipeRevision) &&
        state.executionCapability === AGENT_BAKE_CAPABILITY &&
        Number.isSafeInteger(state.inputTabId) && state.inputTabId >= 1 &&
        typeof state.inputGeneration === "string" &&
            INPUT_GENERATION_PATTERN.test(state.inputGeneration) &&
        isNonNegativeIdentity(state.inputRevision) &&
        isNonNegativeIdentity(state.executionOptionsVersion) &&
        isNonNegativeIdentity(state.viewVersion) &&
        Number.isSafeInteger(state.outputTabId) && state.outputTabId >= 1 &&
        Number.isSafeInteger(state.outputGeneration) && state.outputGeneration >= 1 &&
        Number.isSafeInteger(state.outputVersion) && state.outputVersion >= 1 &&
        Number.isSafeInteger(state.bakeId) && state.bakeId >= 1 &&
        BAKE_TERMINAL_STATES.has(state.terminalState);
}


/**
 * Validates a terminal Bake error context before it reaches the result envelope.
 *
 * @param {string} code - Reviewed public error code.
 * @param {*} context - Candidate stable step and provenance state.
 * @returns {boolean} Whether the context matches the terminal Bake contract.
 */
function isBakeErrorContext(code, context) {
    return BAKE_ERROR_CODES.has(code) && !!context && typeof context === "object" &&
        !Array.isArray(context) &&
        Object.keys(context).every(key => key === "stepId" || key === "state") &&
        isBakeErrorState(context.state) &&
        (context.stepId === null || typeof context.stepId === "string" &&
            context.stepId.length > 0 && context.stepId.length <= RECIPE_STEP_ID_MAX_CHARS &&
            RECIPE_STEP_ID_PATTERN.test(context.stepId));
}

export {
    AGENT_BAKE_CAPABILITY,
    BAKE_STATE_FIELDS,
    isBakeErrorContext,
};
