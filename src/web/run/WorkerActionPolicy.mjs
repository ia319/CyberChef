const WORKER_ACTION_SCOPE = Object.freeze({
    HIGHLIGHT: "highlight",
    LIFECYCLE: "lifecycle",
    REQUEST: "request",
    RUN: "run",
    SILENT_RUN: "silentRun",
});

const WORKER_ACTION = Object.freeze({
    BAKE_COMPLETE: "bakeComplete",
    BAKE_ERROR: "bakeError",
    DISH_RETURNED: "dishReturned",
    HIGHLIGHTS_CALCULATED: "highlightsCalculated",
    OPTION_UPDATE: "optionUpdate",
    PROGRESS_MESSAGE: "progressMessage",
    SET_REGISTERS: "setRegisters",
    SILENT_BAKE_COMPLETE: "silentBakeComplete",
    SILENT_BAKE_ERROR: "silentBakeError",
    STATUS_MESSAGE: "statusMessage",
    WORKER_LOADED: "workerLoaded",
});

const RUN_POLICY = Object.freeze({
    scope: WORKER_ACTION_SCOPE.RUN,
    requiresCurrentRecipe: true,
    terminal: false,
});

const WORKER_ACTION_POLICY = Object.freeze({
    [WORKER_ACTION.BAKE_COMPLETE]: Object.freeze({...RUN_POLICY, terminal: true}),
    [WORKER_ACTION.BAKE_ERROR]: Object.freeze({...RUN_POLICY, terminal: true}),
    [WORKER_ACTION.STATUS_MESSAGE]: RUN_POLICY,
    [WORKER_ACTION.PROGRESS_MESSAGE]: RUN_POLICY,
    [WORKER_ACTION.OPTION_UPDATE]: RUN_POLICY,
    [WORKER_ACTION.SET_REGISTERS]: RUN_POLICY,
    [WORKER_ACTION.HIGHLIGHTS_CALCULATED]: Object.freeze({
        scope: WORKER_ACTION_SCOPE.HIGHLIGHT,
        requiresCurrentRecipe: true,
        terminal: true,
    }),
    [WORKER_ACTION.DISH_RETURNED]: Object.freeze({
        scope: WORKER_ACTION_SCOPE.REQUEST,
        requiresCurrentRecipe: false,
        terminal: true,
    }),
    [WORKER_ACTION.SILENT_BAKE_COMPLETE]: Object.freeze({
        scope: WORKER_ACTION_SCOPE.SILENT_RUN,
        requiresCurrentRecipe: false,
        terminal: true,
    }),
    [WORKER_ACTION.SILENT_BAKE_ERROR]: Object.freeze({
        scope: WORKER_ACTION_SCOPE.SILENT_RUN,
        requiresCurrentRecipe: false,
        terminal: true,
    }),
    [WORKER_ACTION.WORKER_LOADED]: Object.freeze({
        scope: WORKER_ACTION_SCOPE.LIFECYCLE,
        requiresCurrentRecipe: false,
        terminal: false,
    }),
});


/**
 * Returns the fixed policy for one Worker action.
 *
 * @param {*} action - Candidate Worker action.
 * @returns {Object|null} Immutable action policy or null for unknown actions.
 */
function getWorkerActionPolicy(action) {
    if (typeof action !== "string" || !Object.prototype.hasOwnProperty.call(WORKER_ACTION_POLICY, action)) {
        return null;
    }
    return WORKER_ACTION_POLICY[action];
}

export {
    WORKER_ACTION,
    WORKER_ACTION_POLICY,
    WORKER_ACTION_SCOPE,
    getWorkerActionPolicy,
};
