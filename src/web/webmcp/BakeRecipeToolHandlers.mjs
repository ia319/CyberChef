import {RUN_DECISION, RUN_STATE} from "../run/RunCoordinator.mjs";
import {ApprovalError, APPROVAL_STATE} from "./ApprovalCoordinator.mjs";
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
 * Combines invocation and one-use approval cancellation without retaining listeners.
 *
 * @param {AbortSignal} invocationSignal - Session and host invocation signal.
 * @param {AbortSignal} approvalSignal - One-use approval lifetime signal.
 * @returns {Object} Combined signal and idempotent cleanup.
 */
function combineBakeSignals(invocationSignal, approvalSignal) {
    const controller = new AbortController();
    let closed = false;
    const abortInvocation = () => controller.abort(invocationSignal.reason),
        abortApproval = () => controller.abort(approvalSignal.reason),
        close = () => {
            if (closed) return;
            closed = true;
            invocationSignal.removeEventListener("abort", abortInvocation);
            approvalSignal.removeEventListener("abort", abortApproval);
        };

    if (invocationSignal.aborted) abortInvocation();
    else invocationSignal.addEventListener("abort", abortInvocation, {once: true});
    if (approvalSignal.aborted) abortApproval();
    else approvalSignal.addEventListener("abort", abortApproval, {once: true});
    return Object.freeze({signal: controller.signal, close});
}


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
 * @param {ApprovalCoordinator|null} [approvals=null] - Optional one-use approval owner.
 * @returns {Object} Handler keyed by the formal tool name.
 */
function createBakeRecipeToolHandlers(bakeService, approvals=null) {
    if (!bakeService || typeof bakeService.ensureActiveBake !== "function" ||
        approvals !== null && (
            typeof bakeService.prepareActiveBake !== "function" ||
            typeof bakeService.commitPreparedBake !== "function" ||
            typeof approvals.consumeBake !== "function" ||
            typeof approvals.completeBake !== "function" ||
            typeof approvals.getState !== "function"
        )) {
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
        if (!approvals && typeof input.bakeApprovalRequestId !== "undefined") {
            throw new ToolExecutionError(TOOL_ERROR_CODE.INVALID_REQUEST);
        }

        let result;
        try {
            result = approvals && input.bakeApprovalRequestId ?
                await runApprovedBake(input, invocation) :
                await bakeService.ensureActiveBake(input.expectedRevision, invocation.signal);
        } catch (err) {
            if (invocation.signal.aborted) throw invocation.signal.reason;
            if (err instanceof ToolExecutionError) throw err;
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

    /**
     * Consumes one exact Bake permit before starting its prepared Worker target.
     *
     * @param {Object} input - Schema-validated Bake request.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Promise<Object>} Settled content-free Agent Bake result.
     */
    async function runApprovedBake(input, invocation) {
        let preparedBake;
        try {
            preparedBake = await bakeService.prepareActiveBake(
                input.expectedRevision,
                invocation.signal,
                true
            );
        } catch (err) {
            throw new ToolExecutionError(mapAgentBakeError(err));
        }
        invocation.checkpoint();

        let permit;
        try {
            permit = await approvals.consumeBake({
                requestId: input.bakeApprovalRequestId,
                sessionEpoch: invocation.sessionEpoch,
                bakeTarget: preparedBake.target,
            });
        } catch (err) {
            if (err instanceof ApprovalError) {
                throw new ToolExecutionError(TOOL_ERROR_CODE.INVALID_REQUEST);
            }
            throw err;
        }
        invocation.checkpoint();

        const combined = combineBakeSignals(invocation.signal, permit.signal);
        let result;
        try {
            result = await bakeService.commitPreparedBake(preparedBake, combined.signal);
        } catch (err) {
            const approvalCancelled = permit.signal.aborted;
            settleApprovedBake(input.bakeApprovalRequestId, invocation.sessionEpoch, false);
            if (invocation.signal.aborted) throw invocation.signal.reason;
            if (approvalCancelled) {
                throw new ToolExecutionError(TOOL_ERROR_CODE.BAKE_CANCELLED);
            }
            throw new ToolExecutionError(mapAgentBakeError(err));
        } finally {
            combined.close();
        }

        settleApprovedBake(
            input.bakeApprovalRequestId,
            invocation.sessionEpoch,
            result?.terminalState === RUN_STATE.COMPLETED
        );
        return result;
    }

    /**
     * Settles the consumed Bake slot only while it still owns active work.
     *
     * @param {string} requestId - Opaque approval request identifier.
     * @param {number|string} sessionEpoch - Active collaboration epoch.
     * @param {boolean} succeeded - Whether the Run completed successfully.
     */
    function settleApprovedBake(requestId, sessionEpoch, succeeded) {
        const state = approvals.getState();
        if (state.requestId === requestId && state.state === APPROVAL_STATE.BAKE_CONSUMED) {
            approvals.completeBake(requestId, sessionEpoch, succeeded);
        }
    }

    return Object.freeze({
        [TOOL_NAME.BAKE_RECIPE]: bakeRecipe,
    });
}

export {
    combineBakeSignals,
    createBakeRecipeToolHandlers,
};
