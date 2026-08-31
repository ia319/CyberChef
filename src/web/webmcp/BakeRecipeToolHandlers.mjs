import {RUN_DECISION, RUN_STATE} from "../run/RunCoordinator.mjs";
import {AGENT_BAKE_ERROR_CODE, AgentBakeError} from "./AgentBakeError.mjs";
import {createBakeResultState} from "./BakeResultContext.mjs";
import {ToolExecutionError} from "./ToolExecutor.mjs";
import {TOOL_NAME} from "./ToolDefinitions.mjs";
import {TOOL_ERROR_CODE} from "./ToolResult.mjs";

const RUN_DECISIONS = new Set(Object.values(RUN_DECISION));
const TERMINAL_ERROR_CODES = Object.freeze({
    [RUN_STATE.PAUSED]: TOOL_ERROR_CODE.BAKE_PAUSED,
    [RUN_STATE.FAILED]: TOOL_ERROR_CODE.BAKE_FAILED,
    [RUN_STATE.CANCELLED]: TOOL_ERROR_CODE.BAKE_CANCELLED,
    [RUN_STATE.TIMED_OUT]: TOOL_ERROR_CODE.BAKE_TIMEOUT,
    [RUN_STATE.SUPERSEDED]: TOOL_ERROR_CODE.STALE_BAKE_RESULT,
});


/**
 * Maps a pre-Run service failure into the reviewed tool error catalog.
 *
 * @param {Error} error - Agent Bake service failure.
 * @returns {string} Public tool error code.
 */
function mapAgentBakeError(error) {
    if (!(error instanceof AgentBakeError) ||
        !Object.prototype.hasOwnProperty.call(AGENT_BAKE_ERROR_CODE, error.code)) {
        return TOOL_ERROR_CODE.INTERNAL_ERROR;
    }
    return error.code;
}


/**
 * Creates the authorized active-Input Bake handler around its application service.
 *
 * @param {Object} bakeService - Agent Bake application service.
 * @returns {Object} Handler keyed by the formal tool name.
 */
function createBakeRecipeToolHandlers(bakeService) {
    if (!bakeService || typeof bakeService.ensureActiveBake !== "function") {
        throw new TypeError("Bake Recipe tool handler requires the Agent Bake service");
    }

    /**
     * Ensures one exact active workspace target has a settled Recipe Run.
     *
     * @param {Object} input - Schema-validated Recipe revision.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Promise<Object>} Bounded terminal data and provenance state.
     */
    async function bakeRecipe(input, invocation) {
        invocation.checkpoint();

        let result;
        try {
            result = await bakeService.ensureActiveBake(
                input.expectedRevision,
                invocation.signal
            );
        } catch (err) {
            if (invocation.signal.aborted) throw invocation.signal.reason;
            throw new ToolExecutionError(mapAgentBakeError(err));
        }

        invocation.checkpoint();
        if (!result || !RUN_DECISIONS.has(result.decision) ||
            result.terminalState !== RUN_STATE.COMPLETED &&
                !Object.prototype.hasOwnProperty.call(TERMINAL_ERROR_CODES, result.terminalState) ||
            result.progress !== null &&
                (!Number.isSafeInteger(result.progress) || result.progress < 0)) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.INTERNAL_ERROR);
        }

        let state;
        try {
            state = createBakeResultState(invocation.sessionEpoch, result);
        } catch {
            throw new ToolExecutionError(TOOL_ERROR_CODE.INTERNAL_ERROR);
        }

        if (result.terminalState === RUN_STATE.COMPLETED) {
            return {
                data: {
                    decision: result.decision,
                    progress: result.progress,
                },
                state,
            };
        }

        throw new ToolExecutionError(TERMINAL_ERROR_CODES[result.terminalState], {
            stepId: result.stepId ?? null,
            state,
        });
    }

    return Object.freeze({
        [TOOL_NAME.BAKE_RECIPE]: bakeRecipe,
    });
}

export {
    createBakeRecipeToolHandlers,
};
