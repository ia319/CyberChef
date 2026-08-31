import {RUN_FAILURE_KIND, RUN_STATE} from "./RunCoordinator.mjs";


const OUTPUT_TERMINAL_STATES = new Set([
    RUN_STATE.CANCELLED,
    RUN_STATE.COMPLETED,
    RUN_STATE.FAILED,
    RUN_STATE.PAUSED,
    RUN_STATE.SUPERSEDED,
    RUN_STATE.TIMED_OUT,
]);


/**
 * Finds one Input and Output identity tuple in a bound Run target.
 *
 * @param {Object} target - Bound Run target.
 * @param {number} inputTabId - Input tab identity.
 * @returns {Object|null} Matching target tuple or null.
 */
function getTargetInput(target, inputTabId) {
    return target?.inputTargets?.find(item => item.inputTabId === inputTabId) ?? null;
}


/**
 * Creates an immutable content-free provenance record for one Output.
 *
 * @param {Object} target - Bound Run target.
 * @param {number} inputTabId - Input tab identity.
 * @param {number} outputVersion - Monotonic Output result version.
 * @param {Object} [outcome={}] - Optional terminal outcome.
 * @returns {Object} Immutable Output provenance.
 */
function createOutputProvenance(target, inputTabId, outputVersion, outcome={}) {
    const inputTarget = getTargetInput(target, inputTabId),
        terminalState = outcome.state ?? null,
        failureKind = terminalState === RUN_STATE.FAILED ? outcome.failureKind : null,
        progress = outcome.progress ?? null;
    if (!inputTarget || !Number.isSafeInteger(target?.bakeId) || target.bakeId < 1 ||
        !Number.isSafeInteger(target.recipeRevisionAtStart) ||
        !Number.isSafeInteger(target.executionOptionsVersion) ||
        !Number.isSafeInteger(outputVersion) || outputVersion < 1 ||
        (terminalState !== null && !OUTPUT_TERMINAL_STATES.has(terminalState)) ||
        (progress !== null && (!Number.isSafeInteger(progress) || progress < 0)) ||
        (terminalState === RUN_STATE.FAILED &&
            !Object.values(RUN_FAILURE_KIND).includes(failureKind))) {
        throw new TypeError("Output provenance is invalid");
    }

    return Object.freeze({
        bakeId: target.bakeId,
        recipeRevision: target.recipeRevisionAtStart,
        inputTabId: inputTarget.inputTabId,
        inputGeneration: inputTarget.inputGeneration,
        inputRevision: inputTarget.inputRevision,
        outputTabId: inputTarget.outputTabId,
        outputGeneration: inputTarget.outputGeneration,
        outputVersion,
        executionOptions: target.executionOptions,
        executionOptionsVersion: target.executionOptionsVersion,
        terminalState,
        failureKind,
        presenter: typeof outcome.presenter === "string" ? outcome.presenter : null,
        progress,
    });
}


/**
 * Checks whether provenance belongs to one bound Run target and Output.
 *
 * @param {Object|null} provenance - Stored Output provenance.
 * @param {Object} target - Bound Run target.
 * @param {number} inputTabId - Input tab identity.
 * @returns {boolean} Whether every execution identity matches.
 */
function outputProvenanceMatchesTarget(provenance, target, inputTabId) {
    const inputTarget = getTargetInput(target, inputTabId);
    return !!provenance && !!inputTarget && provenance.bakeId === target.bakeId &&
        provenance.recipeRevision === target.recipeRevisionAtStart &&
        provenance.inputTabId === inputTarget.inputTabId &&
        provenance.inputGeneration === inputTarget.inputGeneration &&
        provenance.inputRevision === inputTarget.inputRevision &&
        provenance.outputTabId === inputTarget.outputTabId &&
        provenance.outputGeneration === inputTarget.outputGeneration &&
        provenance.executionOptionsVersion === target.executionOptionsVersion &&
        provenance.executionOptions?.returnType === target.executionOptions?.returnType;
}


export {
    createOutputProvenance,
    outputProvenanceMatchesTarget,
};
