import {RECIPE_EXECUTION_STATE} from "../../core/ExecutionState.mjs";
import {RUN_FAILURE_KIND, RUN_STATE} from "./RunCoordinator.mjs";


/**
 * Maps a Chef response to the coordinator's fixed per-Input outcome.
 *
 * @param {Object} response - Trusted ChefWorker response data.
 * @returns {Object} Immutable Run outcome.
 */
function getRunOutcome(response) {
    const presenter = typeof response?.execution?.presenter === "string" ?
        response.execution.presenter : null;
    if (response?.error) {
        return Object.freeze({
            state: RUN_STATE.FAILED,
            failureKind: RUN_FAILURE_KIND.FATAL,
            presenter,
        });
    }

    switch (response?.execution?.state) {
        case RECIPE_EXECUTION_STATE.COMPLETED:
            return Object.freeze({state: RUN_STATE.COMPLETED, presenter});
        case RECIPE_EXECUTION_STATE.PAUSED:
            return Object.freeze({state: RUN_STATE.PAUSED, presenter});
        case RECIPE_EXECUTION_STATE.EXPECTED_FAILURE:
            return Object.freeze({
                state: RUN_STATE.FAILED,
                failureKind: RUN_FAILURE_KIND.EXPECTED,
                presenter,
            });
        case RECIPE_EXECUTION_STATE.FATAL_FAILURE:
            return Object.freeze({
                state: RUN_STATE.FAILED,
                failureKind: RUN_FAILURE_KIND.FATAL,
                presenter,
            });
        default:
            return Object.freeze({
                state: RUN_STATE.FAILED,
                failureKind: RUN_FAILURE_KIND.PROTOCOL,
                presenter: null,
            });
    }
}

export {
    getRunOutcome,
};
