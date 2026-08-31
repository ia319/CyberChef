import {
    RUN_DECISION,
    RUN_STATE,
} from "../run/RunCoordinator.mjs";
import {
    RUN_TARGET_ERROR_CODE,
    RUN_TARGET_SOURCE,
    RunTargetError,
} from "../run/RunTargetBuilder.mjs";
import {outputProvenanceMatchesTarget} from "../run/OutputProvenance.mjs";
import {AGENT_BAKE_ERROR_CODE, AgentBakeError} from "./AgentBakeError.mjs";
import {
    AGENT_BAKE_CAPABILITY,
} from "./BakeResultContext.mjs";
import {
    PREFLIGHT_ISSUE_CODE,
    preflightOperationRecipe,
} from "./OperationPreflight.mjs";

const UNREVIEWED_ISSUE_CODES = new Set([
    PREFLIGHT_ISSUE_CODE.UNKNOWN_OPERATION,
    PREFLIGHT_ISSUE_CODE.PROFILE_REQUIRED,
    PREFLIGHT_ISSUE_CODE.UNREVIEWED_OPERATION,
]);


/**
 * Stops work at each asynchronous boundary when its invocation is cancelled.
 *
 * @param {AbortSignal|null} signal - Current invocation cancellation signal.
 * @returns {void}
 */
function throwIfAborted(signal) {
    if (signal?.aborted) throw signal.reason;
}


/**
 * Maps a blocked complete-Recipe preflight to a stable public policy error.
 *
 * @param {Object} preflight - Complete local Recipe preflight result.
 * @returns {string|null} Fixed Agent Bake error code or null when allowed.
 */
function getPreflightErrorCode(preflight) {
    if (preflight?.agentBakeAllowed === true) return null;
    return preflight?.issues?.some(issue => UNREVIEWED_ISSUE_CODES.has(issue.code)) ?
        AGENT_BAKE_ERROR_CODE.UNREVIEWED_OPERATION : AGENT_BAKE_ERROR_CODE.RISK_BLOCKED;
}


/**
 * Converts the trusted Recipe configuration into the preflight input shape.
 *
 * @param {Object[]} recipeConfig - Current Recipe configuration.
 * @returns {Object[]} Complete Recipe policy input.
 */
function createPreflightRecipe(recipeConfig) {
    if (!Array.isArray(recipeConfig)) return recipeConfig;
    return recipeConfig.map(operation => ({
        operationName: operation?.op,
        arguments: operation?.args,
        disabled: operation?.disabled === true,
    }));
}


/**
 * Resolves a failure or breakpoint position to its stable Recipe step identity.
 *
 * @param {Object} projection - Current redacted Recipe projection.
 * @param {string} terminalState - Settled Run state.
 * @param {number|null} progress - Final Recipe progress index.
 * @returns {string|null} Stable step identity when the terminal state identifies one.
 */
function getTerminalStepId(projection, terminalState, progress) {
    if (terminalState !== RUN_STATE.FAILED && terminalState !== RUN_STATE.PAUSED) return null;
    return Number.isSafeInteger(progress) && progress >= 0 ?
        projection?.steps?.[progress]?.stepId ?? null : null;
}


/**
 * Ensures Agent-requested work uses one authorized active Input and exact visible target.
 */
class AgentBakeService {
    #app;
    #manager;

    /**
     * @param {Object} app - CyberChef application state.
     * @param {Object} manager - Waiter and Run service registry.
     */
    constructor(app, manager) {
        if (!app?.options || !manager?.recipe || !manager?.input || !manager?.output ||
            !manager?.tabs || !manager?.runTargets || !manager?.worker ||
            typeof manager.recipe.getRecipeRevision !== "function" ||
            typeof manager.recipe.getConfig !== "function" ||
            typeof manager.recipe.getReadProjection !== "function" ||
            typeof manager.input.flushActiveInputForBake !== "function" ||
            typeof manager.input.getSynchronizedInputState !== "function" ||
            typeof manager.output.getOutputState !== "function" ||
            typeof manager.output.getOutputProvenance !== "function" ||
            typeof manager.output.outputIsFresh !== "function" ||
            typeof manager.tabs.getViewState !== "function" ||
            typeof manager.runTargets.capture !== "function" ||
            typeof manager.runTargets.requireActiveTarget !== "function" ||
            typeof manager.runTargets.executionIsCurrent !== "function" ||
            typeof manager.runTargets.viewIsCurrent !== "function" ||
            typeof manager.worker.bakeAgentTarget !== "function" ||
            typeof manager.worker.getCurrentExecutionState !== "function") {
            throw new TypeError("Agent Bake service requires complete application Run services");
        }
        this.#app = app;
        this.#manager = manager;
    }

    /**
     * Returns current active target identities without synchronizing or running user data.
     *
     * @param {number} expectedRevision - Recipe revision already authorized by the handler.
     * @returns {Object} Execution capability and available content-free active state.
     */
    getActiveState(expectedRevision) {
        if (this.#manager.recipe.getRecipeRevision() !== expectedRevision) {
            throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.STALE_RECIPE);
        }

        const viewState = this.#manager.tabs.getViewState(),
            inputState = this.#manager.input.getSynchronizedInputState(
                viewState.activeInputTabId
            ),
            outputState = this.#manager.output.getOutputState(viewState.activeOutputTabId);
        if (!inputState || !outputState || !viewState.tabsSynchronized) {
            return Object.freeze({executionCapability: AGENT_BAKE_CAPABILITY});
        }

        let target;
        try {
            target = this.#manager.runTargets.requireActiveTarget(
                this.#manager.runTargets.capture({
                    source: RUN_TARGET_SOURCE.AGENT,
                    recipeRevisionAtStart: expectedRevision,
                    inputStates: [inputState],
                    outputStates: [outputState],
                    ...viewState,
                    executionOptions: this.#app.options,
                    progress: 0,
                    step: false,
                })
            );
        } catch (err) {
            if (err instanceof RunTargetError && [
                RUN_TARGET_ERROR_CODE.TAB_MISMATCH,
                RUN_TARGET_ERROR_CODE.TARGET_UNAVAILABLE,
            ].includes(err.code)) {
                return Object.freeze({executionCapability: AGENT_BAKE_CAPABILITY});
            }
            throw err;
        }
        if (!this.#targetIsCurrent(target)) {
            return Object.freeze({executionCapability: AGENT_BAKE_CAPABILITY});
        }

        const inputTarget = target.inputTargets[0],
            provenance = this.#manager.output.getOutputProvenance(inputTarget.outputTabId),
            boundTarget = provenance?.bakeId ?
                Object.freeze({...target, bakeId: provenance.bakeId}) : null,
            currentProvenance = boundTarget &&
                outputProvenanceMatchesTarget(provenance, boundTarget, inputTarget.inputTabId) &&
                provenance.outputVersion === outputState.outputVersion ? provenance : null;
        return Object.freeze({
            executionCapability: AGENT_BAKE_CAPABILITY,
            inputTabId: inputTarget.inputTabId,
            inputGeneration: inputTarget.inputGeneration,
            inputRevision: inputTarget.inputRevision,
            executionOptionsVersion: target.executionOptionsVersion,
            viewVersion: target.viewVersion,
            outputTabId: inputTarget.outputTabId,
            outputGeneration: inputTarget.outputGeneration,
            outputVersion: outputState.outputVersion,
            bakeId: currentProvenance?.bakeId ?? null,
            terminalState: currentProvenance?.terminalState ?? null,
        });
    }

    /**
     * Reuses, joins or starts one exact active-Input Run and verifies its visible provenance.
     *
     * @param {number} expectedRevision - Recipe revision authorized by the Agent.
     * @param {AbortSignal|null} [signal=null] - Invocation and Session cancellation signal.
     * @returns {Promise<Object>} Settled content-free Agent Bake result.
     * @throws {AgentBakeError} When policy, target or scheduling prevents the Run.
     */
    async ensureActiveBake(expectedRevision, signal=null) {
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
            throw new TypeError("Expected Recipe revision is invalid");
        }
        throwIfAborted(signal);
        if (this.#manager.recipe.getRecipeRevision() !== expectedRevision) {
            throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.STALE_RECIPE);
        }

        const inputState = await this.#manager.input.flushActiveInputForBake();
        throwIfAborted(signal);
        if (this.#manager.recipe.getRecipeRevision() !== expectedRevision) {
            throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.STALE_RECIPE);
        }

        const recipeConfig = this.#manager.recipe.getConfig(),
            projection = this.#manager.recipe.getReadProjection(),
            preflight = preflightOperationRecipe(
                createPreflightRecipe(recipeConfig),
                inputState.inputByteLength
            ),
            preflightErrorCode = getPreflightErrorCode(preflight);
        if (projection.recipeRevision !== expectedRevision) {
            throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.STALE_RECIPE);
        }
        if (preflightErrorCode) throw new AgentBakeError(preflightErrorCode);
        throwIfAborted(signal);

        const viewState = this.#manager.tabs.getViewState(),
            outputState = this.#manager.output.getOutputState(viewState.activeOutputTabId);
        let target;
        try {
            target = this.#manager.runTargets.requireActiveTarget(
                this.#manager.runTargets.capture({
                    source: RUN_TARGET_SOURCE.AGENT,
                    recipeRevisionAtStart: expectedRevision,
                    inputStates: [inputState],
                    outputStates: outputState ? [outputState] : [],
                    ...viewState,
                    executionOptions: this.#app.options,
                    progress: 0,
                    step: false,
                })
            );
        } catch (err) {
            if (err instanceof RunTargetError && [
                RUN_TARGET_ERROR_CODE.TAB_MISMATCH,
                RUN_TARGET_ERROR_CODE.TARGET_UNAVAILABLE,
            ].includes(err.code)) {
                throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.TAB_MISMATCH);
            }
            throw err;
        }

        if (!this.#targetIsCurrent(target)) {
            throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.STALE_BAKE_RESULT);
        }
        throwIfAborted(signal);

        const request = this.#manager.worker.bakeAgentTarget(target, signal);
        if (!request) throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.STALE_BAKE_RESULT);
        if (request.decision === RUN_DECISION.BUSY) {
            throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.BAKE_BUSY);
        }
        if (!Object.values(RUN_DECISION).includes(request.decision) || !request.completion) {
            throw new TypeError("Agent Bake coordinator request is invalid");
        }

        const run = await request.completion;
        throwIfAborted(signal);
        const boundTarget = Object.freeze({...target, bakeId: run.bakeId});
        if (!this.#targetIsCurrent(boundTarget)) {
            throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.STALE_BAKE_RESULT);
        }

        const inputTarget = boundTarget.inputTargets[0],
            inputOutcome = run.inputs?.length === 1 ? run.inputs[0] : null,
            provenance = this.#manager.output.getOutputProvenance(inputTarget.outputTabId),
            currentOutputState = this.#manager.output.getOutputState(inputTarget.outputTabId);
        if (!inputOutcome || inputOutcome.inputTabId !== inputTarget.inputTabId ||
            run.terminalState !== inputOutcome.state ||
            !outputProvenanceMatchesTarget(provenance, boundTarget, inputTarget.inputTabId) ||
            currentOutputState?.outputVersion !== provenance.outputVersion ||
            provenance.terminalState !== run.terminalState ||
            provenance.progress !== inputOutcome.progress ||
            run.terminalState === RUN_STATE.COMPLETED &&
                !this.#manager.output.outputIsFresh(inputTarget.outputTabId)) {
            throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.STALE_BAKE_RESULT);
        }

        const currentProjection = this.#manager.recipe.getReadProjection();
        if (currentProjection.recipeRevision !== expectedRevision) {
            throw new AgentBakeError(AGENT_BAKE_ERROR_CODE.STALE_BAKE_RESULT);
        }
        return Object.freeze({
            decision: request.decision,
            terminalState: run.terminalState,
            progress: inputOutcome.progress,
            stepId: getTerminalStepId(
                currentProjection,
                run.terminalState,
                inputOutcome.progress
            ),
            target: boundTarget,
            provenance,
        });
    }

    /**
     * Revalidates execution identities and the visible active tab target.
     *
     * @param {Object} target - Captured or bound Agent target.
     * @returns {boolean} Whether the target remains current.
     */
    #targetIsCurrent(target) {
        return this.#manager.runTargets.executionIsCurrent(
            target,
            this.#manager.worker.getCurrentExecutionState(target)
        ) && this.#manager.runTargets.viewIsCurrent(
            target,
            this.#manager.tabs.getViewState()
        );
    }
}

export {
    AgentBakeService,
    createPreflightRecipe,
    getPreflightErrorCode,
    getTerminalStepId,
};
