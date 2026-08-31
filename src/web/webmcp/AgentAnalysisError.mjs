const AGENT_ANALYSIS_ERROR_CODE = Object.freeze({
    ANALYSIS_EMPTY: "ANALYSIS_EMPTY",
    ANALYSIS_FAILED: "ANALYSIS_FAILED",
    ANALYSIS_TIMEOUT: "ANALYSIS_TIMEOUT",
    STALE_OUTPUT_ANALYSIS: "STALE_OUTPUT_ANALYSIS",
});


/**
 * Represents one fixed failure while an Agent inspects the current Output.
 */
class AgentAnalysisError extends Error {
    /**
     * @param {string} code - Fixed Agent analysis error code.
     */
    constructor(code) {
        super("Agent Output analysis could not be completed");
        this.name = "AgentAnalysisError";
        this.code = Object.prototype.hasOwnProperty.call(AGENT_ANALYSIS_ERROR_CODE, code) ?
            code : null;
    }
}

export {
    AGENT_ANALYSIS_ERROR_CODE,
    AgentAnalysisError,
};
