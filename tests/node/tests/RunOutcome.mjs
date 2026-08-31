import assert from "assert";
import {RECIPE_EXECUTION_STATE} from "../../../src/core/ExecutionState.mjs";
import {
    RUN_FAILURE_KIND,
    RUN_STATE,
} from "../../../src/web/run/RunCoordinator.mjs";
import {getRunOutcome} from "../../../src/web/run/RunOutcome.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("RunOutcome: should map every Chef execution state", () => {
        const cases = [
            [RECIPE_EXECUTION_STATE.COMPLETED, RUN_STATE.COMPLETED, undefined],
            [RECIPE_EXECUTION_STATE.PAUSED, RUN_STATE.PAUSED, undefined],
            [RECIPE_EXECUTION_STATE.EXPECTED_FAILURE, RUN_STATE.FAILED,
             RUN_FAILURE_KIND.EXPECTED],
            [RECIPE_EXECUTION_STATE.FATAL_FAILURE, RUN_STATE.FAILED,
             RUN_FAILURE_KIND.FATAL],
            ["unknown", RUN_STATE.FAILED, RUN_FAILURE_KIND.PROTOCOL],
        ];
        for (const [executionState, state, failureKind] of cases) {
            const outcome = getRunOutcome({
                execution: {state: executionState, presenter: "To Base64"},
            });
            assert.equal(outcome.state, state);
            assert.equal(outcome.failureKind, failureKind);
            assert.equal(outcome.presenter, executionState === "unknown" ? null : "To Base64");
        }
    }),

    it("RunOutcome: should prioritize a fatal Chef error", () => {
        assert.deepStrictEqual(getRunOutcome({
            error: {displayStr: "private failure"},
            execution: {
                state: RECIPE_EXECUTION_STATE.COMPLETED,
                presenter: "To Hex",
            },
        }), {
            state: RUN_STATE.FAILED,
            failureKind: RUN_FAILURE_KIND.FATAL,
            presenter: "To Hex",
        });
    }),
]);
