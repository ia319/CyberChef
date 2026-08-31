import {
    AGENT_ANALYSIS_ERROR_CODE,
    AgentAnalysisError,
} from "./AgentAnalysisError.mjs";
import {serializeOutputAnalysis} from "./OutputAnalysisSerializer.mjs";
import {ToolExecutionError} from "./ToolExecutor.mjs";
import {TOOL_NAME} from "./ToolDefinitions.mjs";
import {
    TOOL_ERROR_CODE,
    isSuccessResultWithinBudget,
} from "./ToolResult.mjs";


/**
 * Maps an Agent analysis service failure into the reviewed tool error catalog.
 *
 * @param {Error} error - Agent analysis service failure.
 * @returns {string} Public tool error code.
 */
function mapAgentAnalysisError(error) {
    if (!(error instanceof AgentAnalysisError) ||
        !Object.prototype.hasOwnProperty.call(AGENT_ANALYSIS_ERROR_CODE, error.code)) {
        return TOOL_ERROR_CODE.INTERNAL_ERROR;
    }
    return error.code;
}


/**
 * Creates the authorized current-Output inspection handler around its application service.
 *
 * @param {Object} analysisService - Agent Output analysis application service.
 * @returns {Object} Handler keyed by the formal tool name.
 */
function createInspectOutputToolHandlers(analysisService) {
    if (!analysisService || typeof analysisService.inspectCurrentOutput !== "function") {
        throw new TypeError("Inspect Output tool handler requires the Agent analysis service");
    }

    /**
     * Returns approved derived signals for one exact completed visible Output.
     *
     * @param {Object} input - Schema-validated completed Run identity.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Promise<Object>} Bounded analysis data and collaboration state.
     */
    async function inspectOutput(input, invocation) {
        invocation.checkpoint();

        let result;
        try {
            result = await analysisService.inspectCurrentOutput(
                input.bakeId,
                invocation
            );
        } catch (err) {
            if (invocation.signal.aborted) throw invocation.signal.reason;
            if (err instanceof ToolExecutionError) throw err;
            throw new ToolExecutionError(mapAgentAnalysisError(err));
        }
        invocation.checkpoint();

        let data;
        try {
            data = serializeOutputAnalysis(result.analysis, result.candidates);
        } catch {
            throw new ToolExecutionError(TOOL_ERROR_CODE.INTERNAL_ERROR);
        }
        const state = {sessionEpoch: invocation.sessionEpoch};
        if (!isSuccessResultWithinBudget(data, state)) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.RESULT_TOO_LARGE);
        }
        return {data, state};
    }

    return Object.freeze({
        [TOOL_NAME.INSPECT_OUTPUT]: inspectOutput,
    });
}

export {
    createInspectOutputToolHandlers,
    mapAgentAnalysisError,
};
