import {ExecutionOptionsState} from "./ExecutionOptionsState.mjs";


const RUN_TARGET_SOURCE = Object.freeze({
    INITIAL: "initial",
    MANUAL: "manual",
    AUTO: "auto",
    STEP: "step",
    AGENT: "agent",
});

const RUN_TARGET_ERROR_CODE = Object.freeze({
    INVALID_TARGET: "INVALID_TARGET",
    TAB_MISMATCH: "TAB_MISMATCH",
    TARGET_UNAVAILABLE: "TARGET_UNAVAILABLE",
});

const RUN_TARGET_SOURCES = new Set(Object.values(RUN_TARGET_SOURCE));


/**
 * Represents a fixed workspace target construction failure.
 */
class RunTargetError extends Error {
    /**
     * @param {string} code - Fixed target error code.
     * @param {string} message - Content-free error message.
     */
    constructor(code, message) {
        super(message);
        this.name = "RunTargetError";
        this.code = code;
    }
}


/**
 * Validates one Worker-confirmed Input identity.
 *
 * @param {Object} state - Input identity.
 * @returns {void}
 */
function validateInputState(state) {
    if (!state || !Number.isSafeInteger(state.inputNum) || state.inputNum < 1 ||
        typeof state.inputGeneration !== "string" ||
        !Number.isSafeInteger(state.inputRevision) || state.inputRevision < 0) {
        throw new RunTargetError(
            RUN_TARGET_ERROR_CODE.INVALID_TARGET,
            "Input target identity is invalid"
        );
    }
}


/**
 * Validates one Output identity.
 *
 * @param {Object} state - Output identity.
 * @returns {void}
 */
function validateOutputState(state) {
    if (!state || !Number.isSafeInteger(state.outputTabId) || state.outputTabId < 1 ||
        !Number.isSafeInteger(state.outputGeneration) || state.outputGeneration < 1) {
        throw new RunTargetError(
            RUN_TARGET_ERROR_CODE.INVALID_TARGET,
            "Output target identity is invalid"
        );
    }
}


/**
 * Creates immutable Run targets and versions execution option snapshots.
 */
class RunTargetBuilder {
    #executionOptions = new ExecutionOptionsState();

    /**
     * Captures a complete workspace target without reading Input or Output content.
     *
     * @param {Object} state - Current workspace identity state.
     * @returns {Object} Immutable workspace target.
     */
    capture(state) {
        if (!state || !RUN_TARGET_SOURCES.has(state.source) ||
            !Number.isSafeInteger(state.recipeRevisionAtStart) ||
            state.recipeRevisionAtStart < 0 ||
            !Number.isSafeInteger(state.viewVersion) || state.viewVersion < 0 ||
            !Number.isSafeInteger(state.activeInputTabId) || state.activeInputTabId < 1 ||
            !Number.isSafeInteger(state.activeOutputTabId) || state.activeOutputTabId < 1 ||
            !Number.isSafeInteger(state.progress) || state.progress < 0 ||
            typeof state.step !== "boolean" ||
            !Array.isArray(state.inputStates) || state.inputStates.length < 1 ||
            !Array.isArray(state.outputStates)) {
            throw new RunTargetError(
                RUN_TARGET_ERROR_CODE.INVALID_TARGET,
                "Workspace target state is invalid"
            );
        }

        const outputStates = new Map();
        for (const outputState of state.outputStates) {
            validateOutputState(outputState);
            if (outputStates.has(outputState.outputTabId)) {
                throw new RunTargetError(
                    RUN_TARGET_ERROR_CODE.INVALID_TARGET,
                    "Output target identity is duplicated"
                );
            }
            outputStates.set(outputState.outputTabId, outputState);
        }

        const inputTabIds = new Set(),
            inputTargets = state.inputStates.map(inputState => {
                validateInputState(inputState);
                if (inputTabIds.has(inputState.inputNum)) {
                    throw new RunTargetError(
                        RUN_TARGET_ERROR_CODE.INVALID_TARGET,
                        "Input target identity is duplicated"
                    );
                }
                inputTabIds.add(inputState.inputNum);

                const outputState = outputStates.get(inputState.inputNum);
                if (!outputState) {
                    throw new RunTargetError(
                        RUN_TARGET_ERROR_CODE.TARGET_UNAVAILABLE,
                        "A matching Output target is unavailable"
                    );
                }
                return Object.freeze({
                    inputTabId: inputState.inputNum,
                    inputGeneration: inputState.inputGeneration,
                    inputRevision: inputState.inputRevision,
                    outputTabId: outputState.outputTabId,
                    outputGeneration: outputState.outputGeneration,
                });
            });

        const executionOptionsState = this.#executionOptions.capture(state.executionOptions),
            tabsSynchronized = state.activeInputTabId === state.activeOutputTabId;
        return Object.freeze({
            source: state.source,
            recipeRevisionAtStart: state.recipeRevisionAtStart,
            inputTargets: Object.freeze(inputTargets),
            activeInputTabId: state.activeInputTabId,
            activeOutputTabId: state.activeOutputTabId,
            tabsSynchronized,
            executionOptions: executionOptionsState.options,
            executionOptionsVersion: executionOptionsState.version,
            viewVersion: state.viewVersion,
            progress: state.progress,
            step: state.step,
        });
    }

    /**
     * Binds a newly allocated Bake identity to a captured workspace target.
     *
     * @param {Object} target - Captured workspace target.
     * @param {number} bakeId - New Bake identity.
     * @returns {Object} Immutable bound target.
     */
    bindBakeId(target, bakeId) {
        if (!target || !Number.isSafeInteger(bakeId) || bakeId < 1 ||
            Object.prototype.hasOwnProperty.call(target, "bakeId")) {
            throw new RunTargetError(
                RUN_TARGET_ERROR_CODE.INVALID_TARGET,
                "Bake target identity is invalid"
            );
        }
        return Object.freeze({...target, bakeId});
    }

    /**
     * Narrows a captured target to one Input and its corresponding Output.
     *
     * @param {Object} target - Captured or bound workspace target.
     * @param {number} inputTabId - Input tab identity.
     * @returns {Object} Immutable single-Input target.
     */
    forInput(target, inputTabId) {
        const inputTarget = this.getInputTarget(target, inputTabId);
        if (!inputTarget) {
            throw new RunTargetError(
                RUN_TARGET_ERROR_CODE.TARGET_UNAVAILABLE,
                "The requested Input target is unavailable"
            );
        }
        return Object.freeze({
            ...target,
            inputTargets: Object.freeze([inputTarget]),
        });
    }

    /**
     * Requires the active Input and Output tabs to identify one target.
     *
     * @param {Object} target - Captured or bound workspace target.
     * @returns {Object} Immutable active target.
     */
    requireActiveTarget(target) {
        if (!target?.tabsSynchronized) {
            throw new RunTargetError(
                RUN_TARGET_ERROR_CODE.TAB_MISMATCH,
                "The active Input and Output tabs do not match"
            );
        }
        return this.forInput(target, target.activeInputTabId);
    }

    /**
     * Finds one immutable Input/Output target tuple.
     *
     * @param {Object} target - Workspace target.
     * @param {number} inputTabId - Input tab identity.
     * @returns {Object|null} Matching tuple or null.
     */
    getInputTarget(target, inputTabId) {
        return target?.inputTargets?.find(item => item.inputTabId === inputTabId) ?? null;
    }

    /**
     * Checks whether execution-affecting options still match a target.
     *
     * @param {Object} target - Captured workspace target.
     * @param {Object} options - Current application options.
     * @returns {boolean} Whether execution options remain current.
     */
    executionOptionsAreCurrent(target, options) {
        return this.#executionOptions.isCurrent(target, options);
    }

    /**
     * Checks whether Recipe, Input, Output and execution options still match a target.
     *
     * @param {Object} target - Captured or bound workspace target.
     * @param {Object} state - Current execution identity state.
     * @returns {boolean} Whether the execution target remains current.
     */
    executionIsCurrent(target, state) {
        if (!target || !state ||
            target.recipeRevisionAtStart !== state.recipeRevision ||
            !Array.isArray(state.inputStates) || !Array.isArray(state.outputStates) ||
            !this.executionOptionsAreCurrent(target, state.executionOptions)) {
            return false;
        }

        const inputStates = new Map(state.inputStates
                .filter(Boolean)
                .map(inputState => [inputState.inputNum, inputState])),
            outputStates = new Map(state.outputStates
                .filter(Boolean)
                .map(outputState => [outputState.outputTabId, outputState]));

        return target.inputTargets.every(inputTarget => {
            const inputState = inputStates.get(inputTarget.inputTabId),
                outputState = outputStates.get(inputTarget.outputTabId);
            return inputState?.inputGeneration === inputTarget.inputGeneration &&
                inputState?.inputRevision === inputTarget.inputRevision &&
                outputState?.outputGeneration === inputTarget.outputGeneration;
        });
    }

    /**
     * Checks whether the active view still matches a target.
     *
     * @param {Object} target - Captured workspace target.
     * @param {Object} viewState - Current active tab state.
     * @returns {boolean} Whether the view remains current.
     */
    viewIsCurrent(target, viewState) {
        return !!target && !!viewState &&
            target.viewVersion === viewState.viewVersion &&
            target.activeInputTabId === viewState.activeInputTabId &&
            target.activeOutputTabId === viewState.activeOutputTabId &&
            target.tabsSynchronized === viewState.tabsSynchronized;
    }

}

export {
    RUN_TARGET_ERROR_CODE,
    RUN_TARGET_SOURCE,
    RunTargetBuilder,
    RunTargetError,
};
