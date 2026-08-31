const AGENT_BAKE_ERROR_CODE = Object.freeze({
    STALE_RECIPE: "STALE_RECIPE",
    UNREVIEWED_OPERATION: "UNREVIEWED_OPERATION",
    RISK_BLOCKED: "RISK_BLOCKED",
    TAB_MISMATCH: "TAB_MISMATCH",
    BAKE_BUSY: "BAKE_BUSY",
    STALE_BAKE_RESULT: "STALE_BAKE_RESULT",
});


/**
 * Represents one fixed failure before an Agent Bake reaches a settled Run.
 */
class AgentBakeError extends Error {
    /**
     * @param {string} code - Fixed Agent Bake error code.
     */
    constructor(code) {
        super("Agent Bake could not be completed");
        this.name = "AgentBakeError";
        this.code = Object.prototype.hasOwnProperty.call(AGENT_BAKE_ERROR_CODE, code) ?
            code : null;
    }
}

export {
    AGENT_BAKE_ERROR_CODE,
    AgentBakeError,
};
