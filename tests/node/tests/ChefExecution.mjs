import assert from "assert";
import Chef from "../../../src/core/Chef.mjs";
import {RECIPE_EXECUTION_STATE} from "../../../src/core/ExecutionState.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("Chef execution: should classify a completed Recipe", async () => {
        const result = await new Chef().bake("hello", [{
            op: "To Base64",
            args: ["A-Za-z0-9+/="],
        }]);

        assert.deepStrictEqual(result.execution, {
            state: RECIPE_EXECUTION_STATE.COMPLETED,
            progress: 1,
            presenter: "To Base64",
        });
    }),

    it("Chef execution: should classify a breakpoint pause", async () => {
        const result = await new Chef().bake("hello", [{
            op: "To Base64",
            args: ["A-Za-z0-9+/="],
            breakpoint: true,
        }]);

        assert.deepStrictEqual(result.execution, {
            state: RECIPE_EXECUTION_STATE.PAUSED,
            progress: 0,
            presenter: null,
        });
    }),

    it("Chef execution: should classify an expected Operation failure", async () => {
        const result = await new Chef().bake("not-a-uuid", [{
            op: "Analyse UUID",
            args: [true],
        }]);

        assert.equal(result.error, false);
        assert.deepStrictEqual(result.execution, {
            state: RECIPE_EXECUTION_STATE.EXPECTED_FAILURE,
            progress: 0,
            presenter: null,
        });
    }),

    it("Chef execution: should classify a fatal Operation failure", async () => {
        const result = await new Chef().bake("15 4 7", [{
            op: "MOD",
            args: [0, "Space"],
        }]);

        assert.notEqual(result.error, false);
        assert.deepStrictEqual(result.execution, {
            state: RECIPE_EXECUTION_STATE.FATAL_FAILURE,
            progress: 0,
            presenter: null,
        });
    }),
]);
