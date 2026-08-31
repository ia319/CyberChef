import assert from "assert";
import {
    RUN_DECISION,
    RUN_FAILURE_KIND,
    RUN_MODE,
    RUN_OWNER,
    RUN_STATE,
    RUN_WAITER_ERROR_CODE,
    RunCoordinator,
    getRunOwner,
} from "../../../src/web/run/RunCoordinator.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


/**
 * Creates a content-free target fixture.
 *
 * @param {Object} overrides - Target properties to replace.
 * @returns {Object} Immutable workspace target.
 */
function createTarget(overrides={}) {
    return Object.freeze({
        source: "manual",
        recipeRevisionAtStart: 4,
        inputTargets: Object.freeze([Object.freeze({
            inputTabId: 2,
            inputGeneration: "1:2",
            inputRevision: 3,
            outputTabId: 2,
            outputGeneration: 7,
        })]),
        executionOptions: Object.freeze({}),
        executionOptionsVersion: 0,
        viewVersion: 5,
        progress: 0,
        step: false,
        ...overrides,
    });
}


TestRegister.addApiTests([
    it("RunCoordinator: should assign lifecycle ownership by mode", () => {
        assert.equal(getRunOwner(RUN_MODE.MANUAL), RUN_OWNER.USER);
        assert.equal(getRunOwner(RUN_MODE.STEP), RUN_OWNER.USER);
        assert.equal(getRunOwner(RUN_MODE.AUTO), RUN_OWNER.SYSTEM);
        assert.equal(getRunOwner(RUN_MODE.INITIAL), RUN_OWNER.SYSTEM);
        assert.equal(getRunOwner(RUN_MODE.SILENT), RUN_OWNER.SYSTEM);
        assert.equal(getRunOwner(RUN_MODE.AGENT), RUN_OWNER.AGENT);
        assert.equal(getRunOwner("unknown"), null);
    }),

    it("RunCoordinator: should settle a multi-Input Run exactly once", async () => {
        const coordinator = new RunCoordinator(),
            target = createTarget({
                inputTargets: Object.freeze([
                    createTarget().inputTargets[0],
                    Object.freeze({
                        inputTabId: 3,
                        inputGeneration: "1:3",
                        inputRevision: 1,
                        outputTabId: 3,
                        outputGeneration: 8,
                    }),
                ]),
            }),
            request = coordinator.ensure(target, {
                owner: RUN_OWNER.USER,
                mode: RUN_MODE.MANUAL,
            });

        assert.equal(request.decision, RUN_DECISION.STARTED);
        assert.equal(coordinator.markRunning(request.run.bakeId, 2), true);
        assert.equal(coordinator.markRunning(request.run.bakeId, 3), true);
        assert.equal(coordinator.settleInput(request.run.bakeId, 2, {
            state: RUN_STATE.COMPLETED,
            presenter: "To Base64",
        }), true);
        assert.equal(coordinator.settleInput(request.run.bakeId, 3, {
            state: RUN_STATE.PAUSED,
        }), true);
        assert.equal(coordinator.settleInput(request.run.bakeId, 3, {
            state: RUN_STATE.COMPLETED,
        }), false);

        const result = await request.completion;
        assert.equal(result.terminalState, RUN_STATE.PAUSED);
        assert.equal(result.inputs[0].presenter, "To Base64");
        assert.equal(Object.isFrozen(result), true);
        assert.doesNotThrow(() => JSON.stringify(result));
    }),

    it("RunCoordinator: should reuse, join, start and reject busy targets", async () => {
        const coordinator = new RunCoordinator(),
            target = createTarget(),
            started = coordinator.ensure(target, {
                owner: RUN_OWNER.USER,
                mode: RUN_MODE.MANUAL,
            }),
            joined = coordinator.ensure(target, {
                owner: RUN_OWNER.AGENT,
                mode: RUN_MODE.AGENT,
            }),
            busy = coordinator.ensure(createTarget({recipeRevisionAtStart: 5}), {
                owner: RUN_OWNER.AGENT,
                mode: RUN_MODE.AGENT,
            });

        assert.equal(started.decision, RUN_DECISION.STARTED);
        assert.equal(joined.decision, RUN_DECISION.JOINED);
        assert.equal(joined.run.bakeId, started.run.bakeId);
        assert.equal(busy.decision, RUN_DECISION.BUSY);
        coordinator.markRunning(started.run.bakeId, 2);
        coordinator.settleInput(started.run.bakeId, 2, {state: RUN_STATE.COMPLETED});
        await Promise.all([started.completion, joined.completion]);

        const fresh = coordinator.ensure(target, {
            owner: RUN_OWNER.AGENT,
            mode: RUN_MODE.AGENT,
        });
        assert.equal(fresh.decision, RUN_DECISION.ALREADY_FRESH);
        assert.equal((await fresh.completion).bakeId, started.run.bakeId);

        const forced = coordinator.ensure(target, {
            owner: RUN_OWNER.USER,
            mode: RUN_MODE.MANUAL,
            reuseFresh: false,
        });
        assert.equal(forced.decision, RUN_DECISION.STARTED);
        coordinator.settle(forced.run.bakeId, RUN_STATE.CANCELLED);
        await forced.completion;
    }),

    it("RunCoordinator: should aggregate expected and fatal failures", async () => {
        for (const failureKind of [RUN_FAILURE_KIND.EXPECTED, RUN_FAILURE_KIND.FATAL]) {
            const coordinator = new RunCoordinator(),
                request = coordinator.ensure(createTarget(), {
                    owner: RUN_OWNER.USER,
                    mode: RUN_MODE.MANUAL,
                });
            coordinator.settleInput(request.run.bakeId, 2, {
                state: RUN_STATE.FAILED,
                failureKind,
            });
            const result = await request.completion;
            assert.equal(result.terminalState, RUN_STATE.FAILED);
            assert.equal(result.failureKind, failureKind);
        }
    }),

    it("RunCoordinator: should preserve mutually exclusive terminal states", async () => {
        for (const state of [
            RUN_STATE.CANCELLED,
            RUN_STATE.FAILED,
            RUN_STATE.SUPERSEDED,
        ]) {
            const coordinator = new RunCoordinator(),
                request = coordinator.ensure(createTarget(), {
                    owner: RUN_OWNER.USER,
                    mode: RUN_MODE.MANUAL,
                }),
                failureKind = state === RUN_STATE.FAILED ? RUN_FAILURE_KIND.PROTOCOL : null;
            assert.equal(coordinator.settle(request.run.bakeId, state, failureKind), true);
            assert.equal(coordinator.settle(request.run.bakeId, RUN_STATE.COMPLETED), false);
            assert.equal((await request.completion).terminalState, state);
        }
    }),

    it("RunCoordinator: should time out and notify its Worker adapter", async () => {
        let timeoutCallback,
            timedOutRun;
        const coordinator = new RunCoordinator({
                setTimeoutFn: callback => {
                    timeoutCallback = callback;
                    return 7;
                },
                clearTimeoutFn: () => {},
                onTimeout: run => {
                    timedOutRun = run;
                },
            }),
            request = coordinator.ensure(createTarget(), {
                owner: RUN_OWNER.USER,
                mode: RUN_MODE.MANUAL,
                timeoutMs: 10,
            });

        timeoutCallback();
        const result = await request.completion;
        assert.equal(result.terminalState, RUN_STATE.TIMED_OUT);
        assert.equal(timedOutRun.bakeId, request.run.bakeId);
    }),

    it("RunCoordinator: should only cancel work abandoned by its sole Agent waiter", async () => {
        const abortController = new AbortController();
        let abandonedRun = null;
        const coordinator = new RunCoordinator({
                onExclusiveAgentAbort: run => {
                    abandonedRun = run;
                },
            }),
            request = coordinator.ensure(createTarget(), {
                owner: RUN_OWNER.AGENT,
                mode: RUN_MODE.AGENT,
                signal: abortController.signal,
            });

        abortController.abort();
        await assert.rejects(request.completion, error =>
            error.code === RUN_WAITER_ERROR_CODE.ABORTED
        );
        assert.equal(abandonedRun.bakeId, request.run.bakeId);

        const sharedAbort = new AbortController(),
            userRun = new RunCoordinator({
                onExclusiveAgentAbort: () => assert.fail("Shared work must remain active"),
            }),
            human = userRun.ensure(createTarget(), {
                owner: RUN_OWNER.USER,
                mode: RUN_MODE.MANUAL,
            }),
            agent = userRun.ensure(createTarget(), {
                owner: RUN_OWNER.AGENT,
                mode: RUN_MODE.AGENT,
                signal: sharedAbort.signal,
            });
        sharedAbort.abort();
        await assert.rejects(agent.completion, error =>
            error.code === RUN_WAITER_ERROR_CODE.ABORTED
        );
        userRun.settle(human.run.bakeId, RUN_STATE.CANCELLED);
        await human.completion;
    }),
]);
