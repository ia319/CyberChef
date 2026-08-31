import assert from "assert";
import {
    INPUT_SYNC_RESULT_CODE,
    InputSyncController,
} from "../../../src/web/run/InputSyncController.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("InputSyncController: should settle a matching Worker acknowledgement", async () => {
        const controller = new InputSyncController();
        controller.registerState({
            inputNum: 1,
            inputGeneration: "2:4",
            inputRevision: 7,
        });
        const update = controller.startUpdate(1);

        assert.equal(controller.acknowledge({
            ...update.request,
            inputRevision: 8,
            applied: true,
        }), true);
        assert.deepStrictEqual(await update.completion, {
            ok: true,
            code: INPUT_SYNC_RESULT_CODE.SYNCED,
            state: {
                inputNum: 1,
                inputGeneration: "2:4",
                inputRevision: 8,
            },
        });
        assert.deepStrictEqual(controller.getState(1), {
            inputNum: 1,
            inputGeneration: "2:4",
            inputRevision: 8,
        });
    }),

    it("InputSyncController: should reject mismatched acknowledgements", async () => {
        const controller = new InputSyncController();
        controller.registerState({
            inputNum: 1,
            inputGeneration: "1:1",
            inputRevision: 0,
        });
        const update = controller.startUpdate(1);

        assert.equal(controller.acknowledge({
            ...update.request,
            inputGeneration: "1:2",
            inputRevision: 1,
            applied: true,
        }), true);
        assert.deepStrictEqual(await update.completion, {
            ok: false,
            code: INPUT_SYNC_RESULT_CODE.REJECTED,
            state: null,
        });
        assert.equal(controller.getState(1).inputRevision, 0);
    }),

    it("InputSyncController: should invalidate pending work when an Input is replaced", async () => {
        const controller = new InputSyncController();
        controller.registerState({
            inputNum: 3,
            inputGeneration: "1:3",
            inputRevision: 2,
        });
        const update = controller.startUpdate(3);

        controller.registerState({
            inputNum: 3,
            inputGeneration: "1:4",
            inputRevision: 0,
        });
        assert.deepStrictEqual(await update.completion, {
            ok: false,
            code: INPUT_SYNC_RESULT_CODE.INPUT_REPLACED,
            state: null,
        });
        assert.equal(controller.getState(3).inputGeneration, "1:4");
    }),

    it("InputSyncController: should reject revision rollback", () => {
        const controller = new InputSyncController();
        controller.registerState({
            inputNum: 1,
            inputGeneration: "1:1",
            inputRevision: 2,
        });

        assert.throws(() => controller.registerState({
            inputNum: 1,
            inputGeneration: "1:1",
            inputRevision: 1,
        }), RangeError);
    }),

    it("InputSyncController: should settle a rollback acknowledgement as rejected", async () => {
        const controller = new InputSyncController();
        controller.registerState({
            inputNum: 1,
            inputGeneration: "1:1",
            inputRevision: 2,
        });
        const update = controller.startUpdate(1);

        assert.equal(controller.acknowledge({
            ...update.request,
            inputRevision: 1,
            applied: true,
        }), true);
        assert.deepStrictEqual(await update.completion, {
            ok: false,
            code: INPUT_SYNC_RESULT_CODE.REJECTED,
            state: null,
        });
        assert.equal(controller.getState(1).inputRevision, 2);
    }),

    it("InputSyncController: should settle pending work on removal and reset", async () => {
        const controller = new InputSyncController();
        controller.registerState({
            inputNum: 1,
            inputGeneration: "1:1",
            inputRevision: 0,
        });
        controller.registerState({
            inputNum: 2,
            inputGeneration: "1:2",
            inputRevision: 0,
        });
        const removed = controller.startUpdate(1),
            reset = controller.startUpdate(2);

        controller.removeState(1);
        controller.reset();
        assert.equal((await removed.completion).code, INPUT_SYNC_RESULT_CODE.INPUT_REMOVED);
        assert.equal((await reset.completion).code, INPUT_SYNC_RESULT_CODE.RESET);
        assert.equal(controller.getState(1), null);
        assert.equal(controller.getState(2), null);
    }),
]);
