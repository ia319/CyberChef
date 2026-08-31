import assert from "assert";
import {
    WORKER_ACTION,
    WORKER_ACTION_POLICY,
    WORKER_ACTION_SCOPE,
    getWorkerActionPolicy,
} from "../../../src/web/run/WorkerActionPolicy.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WorkerActionPolicy: should classify every page-affecting Worker action", () => {
        assert.deepStrictEqual(Object.keys(WORKER_ACTION_POLICY).sort(), Object.values(WORKER_ACTION).sort());
        for (const action of [
            WORKER_ACTION.BAKE_COMPLETE,
            WORKER_ACTION.BAKE_ERROR,
            WORKER_ACTION.STATUS_MESSAGE,
            WORKER_ACTION.PROGRESS_MESSAGE,
            WORKER_ACTION.OPTION_UPDATE,
            WORKER_ACTION.SET_REGISTERS,
        ]) {
            const policy = getWorkerActionPolicy(action);
            assert.equal(policy.scope, WORKER_ACTION_SCOPE.RUN);
            assert.equal(policy.requiresCurrentRecipe, true);
        }
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.BAKE_COMPLETE).terminal, true);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.BAKE_ERROR).terminal, true);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.STATUS_MESSAGE).terminal, false);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.PROGRESS_MESSAGE).terminal, false);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.OPTION_UPDATE).terminal, false);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.SET_REGISTERS).terminal, false);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.HIGHLIGHTS_CALCULATED).scope,
            WORKER_ACTION_SCOPE.HIGHLIGHT);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.HIGHLIGHTS_CALCULATED).requiresCurrentRecipe,
            true);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.HIGHLIGHTS_CALCULATED).terminal, true);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.DISH_RETURNED).scope,
            WORKER_ACTION_SCOPE.REQUEST);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.DISH_RETURNED).requiresCurrentRecipe, false);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.DISH_RETURNED).terminal, true);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.SILENT_BAKE_COMPLETE).scope,
            WORKER_ACTION_SCOPE.SILENT_RUN);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.SILENT_BAKE_COMPLETE).requiresCurrentRecipe,
            false);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.SILENT_BAKE_COMPLETE).terminal, true);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.SILENT_BAKE_ERROR).scope,
            WORKER_ACTION_SCOPE.SILENT_RUN);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.SILENT_BAKE_ERROR).requiresCurrentRecipe,
            false);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.SILENT_BAKE_ERROR).terminal, true);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.WORKER_LOADED).scope,
            WORKER_ACTION_SCOPE.LIFECYCLE);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.WORKER_LOADED).requiresCurrentRecipe, false);
        assert.equal(getWorkerActionPolicy(WORKER_ACTION.WORKER_LOADED).terminal, false);
        assert.equal(getWorkerActionPolicy("__proto__"), null);
        assert.equal(getWorkerActionPolicy({toString: () => "bakeComplete"}), null);
    }),
]);
