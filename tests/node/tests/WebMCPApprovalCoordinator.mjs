import assert from "assert";
import {
    fingerprintApprovalAction,
    MAX_APPROVAL_ACTION_BYTES,
} from "../../../src/web/webmcp/ApprovalAction.mjs";
import {
    APPROVAL_CHANGE_TYPE,
    APPROVAL_END_REASON,
    APPROVAL_ERROR_CODE,
    APPROVAL_MODE,
    APPROVAL_RISK_FLAG,
    APPROVAL_STATE,
    ApprovalCoordinator,
} from "../../../src/web/webmcp/ApprovalCoordinator.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const ACTION = Object.freeze({
        expectedRevision: 7,
        changes: Object.freeze([
            Object.freeze({
                type: "insert",
                operation: "Generate HOTP",
                args: Object.freeze({Secret: "SECRET_CANARY", Counter: 1}),
            }),
        ]),
    }),
    SUMMARY = Object.freeze({
        operationNames: Object.freeze(["Generate HOTP"]),
        changeTypes: Object.freeze([APPROVAL_CHANGE_TYPE.INSERT]),
        sensitiveParameterNames: Object.freeze(["Secret"]),
        riskFlags: Object.freeze([APPROVAL_RISK_FLAG.SECRET_INPUT]),
    }),
    BAKE_TARGET = Object.freeze({
        recipeRevision: 8,
        inputGeneration: "1:2",
        inputRevision: 3,
        outputTabId: 1,
        outputGeneration: 4,
        executionOptionsVersion: 0,
    });


/**
 * Creates a deterministic coordinator fixture.
 *
 * @returns {Object} Coordinator, clock controls, and emitted state count.
 */
function createFixture() {
    let now = 1_000,
        timer = null,
        changeCount = 0,
        nextId = 1;
    const coordinator = new ApprovalCoordinator({
        ttlMs: 100,
        nowFn: () => now,
        setTimeoutFn: callback => {
            timer = callback;
            return 1;
        },
        clearTimeoutFn: () => {
            timer = null;
        },
        idFactory: () => `approval-request-${nextId++}`,
    });
    coordinator.addEventListener("change", () => changeCount++);

    return {
        coordinator,
        advance(milliseconds) {
            now += milliseconds;
            const callback = timer;
            if (callback) callback();
        },
        getChangeCount: () => changeCount,
    };
}


/**
 * Creates one pending approval request.
 *
 * @param {ApprovalCoordinator} coordinator - Test coordinator.
 * @returns {Promise<Object>} Public pending state.
 */
function requestApproval(coordinator) {
    return coordinator.requestApproval({
        sessionEpoch: "session-epoch-1",
        action: ACTION,
        summary: SUMMARY,
    });
}


TestRegister.addApiTests([
    it("WebMCPApprovalAction: should fingerprint canonical JSON values", async () => {
        const first = await fingerprintApprovalAction({b: [2, 3], a: {d: true, c: null}}),
            second = await fingerprintApprovalAction({a: {c: null, d: true}, b: [2, 3]});

        assert.equal(first, second);
        assert.match(first, /^[0-9a-f]{64}$/u);
    }),

    it("WebMCPApprovalAction: should reject unsafe and oversized actions", async () => {
        const accessor = {};
        Object.defineProperty(accessor, "secret", {enumerable: true, get: () => "value"});

        await assert.rejects(fingerprintApprovalAction(accessor), TypeError);
        await assert.rejects(
            fingerprintApprovalAction({value: "x".repeat(MAX_APPROVAL_ACTION_BYTES + 1)}),
            RangeError
        );
        await assert.rejects(fingerprintApprovalAction({value: -0}), TypeError);
    }),

    it("WebMCPApprovalCoordinator: should expose only a redacted pending request", async () => {
        const {coordinator, getChangeCount} = createFixture(),
            state = await requestApproval(coordinator),
            serialized = JSON.stringify(state);

        assert.deepStrictEqual(state, {
            requestId: "approval-request-1",
            state: APPROVAL_STATE.PENDING,
            mode: null,
            expiresAt: 1_100,
            endReason: null,
            summary: SUMMARY,
        });
        assert.equal(serialized.includes("SECRET_CANARY"), false);
        assert.equal(serialized.includes("inputGeneration"), false);
        assert.equal(serialized.includes("fingerprint"), false);
        assert.equal(getChangeCount(), 1);
    }),

    it("WebMCPApprovalCoordinator: should reject unsafe display summaries", async () => {
        const {coordinator} = createFixture(),
            summary = {...SUMMARY};
        Object.defineProperty(summary, "riskFlags", {
            enumerable: true,
            get: () => [APPROVAL_RISK_FLAG.SECRET_INPUT],
        });

        await assert.rejects(
            coordinator.requestApproval({
                sessionEpoch: "session-epoch-1",
                action: ACTION,
                summary,
            }),
            TypeError
        );
    }),

    it("WebMCPApprovalCoordinator: should reuse only an identical active request", async () => {
        const {coordinator} = createFixture(),
            first = await requestApproval(coordinator),
            duplicate = await requestApproval(coordinator);

        assert.equal(duplicate.requestId, first.requestId);
        await assert.rejects(
            coordinator.requestApproval({
                sessionEpoch: "session-epoch-1",
                action: {...ACTION, expectedRevision: 8},
                summary: SUMMARY,
            }),
            err => err.code === APPROVAL_ERROR_CODE.REQUEST_BUSY
        );
        await assert.rejects(
            coordinator.requestApproval({
                sessionEpoch: "session-epoch-2",
                action: ACTION,
                summary: SUMMARY,
            }),
            err => err.code === APPROVAL_ERROR_CODE.REQUEST_BUSY
        );
    }),

    it("WebMCPApprovalCoordinator: should consume an exact mutation once", async () => {
        const {coordinator} = createFixture(),
            pending = await requestApproval(coordinator);

        coordinator.approve(
            pending.requestId,
            "session-epoch-1",
            APPROVAL_MODE.RECIPE_ONLY
        );
        const permit = await coordinator.consumeMutation({
            requestId: pending.requestId,
            sessionEpoch: "session-epoch-1",
            action: ACTION,
        });
        assert.equal(permit.mode, APPROVAL_MODE.RECIPE_ONLY);
        assert.equal(permit.signal.aborted, false);
        assert.equal(coordinator.getState().state, APPROVAL_STATE.MUTATION_CONSUMED);

        await assert.rejects(
            coordinator.consumeMutation({
                requestId: pending.requestId,
                sessionEpoch: "session-epoch-1",
                action: ACTION,
            }),
            err => err.code === APPROVAL_ERROR_CODE.REQUEST_STATE_MISMATCH
        );
        const complete = await coordinator.completeMutation({
            requestId: pending.requestId,
            sessionEpoch: "session-epoch-1",
            succeeded: true,
        });
        assert.equal(complete.state, APPROVAL_STATE.COMPLETE);
    }),

    it("WebMCPApprovalCoordinator: should reject changed actions and sessions", async () => {
        const {coordinator} = createFixture(),
            pending = await requestApproval(coordinator);
        coordinator.approve(
            pending.requestId,
            "session-epoch-1",
            APPROVAL_MODE.RECIPE_ONLY
        );

        await assert.rejects(
            coordinator.consumeMutation({
                requestId: pending.requestId,
                sessionEpoch: "session-epoch-1",
                action: {...ACTION, expectedRevision: 8},
            }),
            err => err.code === APPROVAL_ERROR_CODE.ACTION_MISMATCH
        );
        await assert.rejects(
            coordinator.consumeMutation({
                requestId: pending.requestId,
                sessionEpoch: "session-epoch-2",
                action: ACTION,
            }),
            err => err.code === APPROVAL_ERROR_CODE.SESSION_MISMATCH
        );
        assert.equal(coordinator.getState().state, APPROVAL_STATE.APPROVED);
    }),

    it("WebMCPApprovalCoordinator: should bind one Bake permit to its exact target", async () => {
        const {coordinator} = createFixture(),
            pending = await requestApproval(coordinator);
        coordinator.approve(
            pending.requestId,
            "session-epoch-1",
            APPROVAL_MODE.RECIPE_AND_BAKE
        );
        await coordinator.consumeMutation({
            requestId: pending.requestId,
            sessionEpoch: "session-epoch-1",
            action: ACTION,
        });
        const available = await coordinator.completeMutation({
            requestId: pending.requestId,
            sessionEpoch: "session-epoch-1",
            succeeded: true,
            bakeTarget: BAKE_TARGET,
        });
        assert.equal(available.state, APPROVAL_STATE.BAKE_AVAILABLE);

        await assert.rejects(
            coordinator.consumeBake({
                requestId: pending.requestId,
                sessionEpoch: "session-epoch-1",
                bakeTarget: {...BAKE_TARGET, outputTabId: 2},
            }),
            err => err.code === APPROVAL_ERROR_CODE.BAKE_TARGET_MISMATCH
        );
        const permit = await coordinator.consumeBake({
            requestId: pending.requestId,
            sessionEpoch: "session-epoch-1",
            bakeTarget: BAKE_TARGET,
        });
        assert.equal(permit.signal.aborted, false);
        assert.equal(coordinator.getState().state, APPROVAL_STATE.BAKE_CONSUMED);
        assert.equal(
            coordinator.completeBake(pending.requestId, "session-epoch-1", true).state,
            APPROVAL_STATE.COMPLETE
        );
        await assert.rejects(
            coordinator.consumeBake({
                requestId: pending.requestId,
                sessionEpoch: "session-epoch-1",
                bakeTarget: BAKE_TARGET,
            }),
            err => err.code === APPROVAL_ERROR_CODE.REQUEST_STATE_MISMATCH
        );
    }),

    it("WebMCPApprovalCoordinator: should expire unused permits", async () => {
        const {coordinator, advance} = createFixture(),
            pending = await requestApproval(coordinator);

        advance(100);
        const state = coordinator.getState();
        assert.equal(state.state, APPROVAL_STATE.EXPIRED);
        assert.equal(state.endReason, APPROVAL_END_REASON.EXPIRED);
        await assert.rejects(
            coordinator.consumeMutation({
                requestId: pending.requestId,
                sessionEpoch: "session-epoch-1",
                action: ACTION,
            }),
            err => err.code === APPROVAL_ERROR_CODE.REQUEST_EXPIRED
        );
    }),

    it("WebMCPApprovalCoordinator: should reject, cancel, and invalidate without replay", async () => {
        const rejected = createFixture(),
            rejectedRequest = await requestApproval(rejected.coordinator);
        assert.equal(
            rejected.coordinator.reject(rejectedRequest.requestId, "session-epoch-1").state,
            APPROVAL_STATE.REJECTED
        );

        const cancelled = createFixture(),
            cancelledRequest = await requestApproval(cancelled.coordinator);
        cancelled.coordinator.approve(
            cancelledRequest.requestId,
            "session-epoch-1",
            APPROVAL_MODE.RECIPE_ONLY
        );
        const permit = await cancelled.coordinator.consumeMutation({
            requestId: cancelledRequest.requestId,
            sessionEpoch: "session-epoch-1",
            action: ACTION,
        });
        cancelled.coordinator.invalidate(APPROVAL_END_REASON.RECIPE_CHANGED);
        assert.equal(permit.signal.aborted, true);
        assert.equal(cancelled.coordinator.getState().state, APPROVAL_STATE.CANCELLED);
        assert.equal(
            cancelled.coordinator.getState().endReason,
            APPROVAL_END_REASON.RECIPE_CHANGED
        );
    }),

    it("WebMCPApprovalCoordinator: should cancel failed mutation and Bake work", async () => {
        const mutation = createFixture(),
            mutationRequest = await requestApproval(mutation.coordinator);
        mutation.coordinator.approve(
            mutationRequest.requestId,
            "session-epoch-1",
            APPROVAL_MODE.RECIPE_ONLY
        );
        const mutationPermit = await mutation.coordinator.consumeMutation({
            requestId: mutationRequest.requestId,
            sessionEpoch: "session-epoch-1",
            action: ACTION,
        });
        await mutation.coordinator.completeMutation({
            requestId: mutationRequest.requestId,
            sessionEpoch: "session-epoch-1",
            succeeded: false,
        });
        assert.equal(mutationPermit.signal.aborted, true);
        assert.equal(
            mutation.coordinator.getState().endReason,
            APPROVAL_END_REASON.MUTATION_FAILED
        );

        const bake = createFixture(),
            bakeRequest = await requestApproval(bake.coordinator);
        bake.coordinator.approve(
            bakeRequest.requestId,
            "session-epoch-1",
            APPROVAL_MODE.RECIPE_AND_BAKE
        );
        await bake.coordinator.consumeMutation({
            requestId: bakeRequest.requestId,
            sessionEpoch: "session-epoch-1",
            action: ACTION,
        });
        await bake.coordinator.completeMutation({
            requestId: bakeRequest.requestId,
            sessionEpoch: "session-epoch-1",
            succeeded: true,
            bakeTarget: BAKE_TARGET,
        });
        const bakePermit = await bake.coordinator.consumeBake({
            requestId: bakeRequest.requestId,
            sessionEpoch: "session-epoch-1",
            bakeTarget: BAKE_TARGET,
        });
        bake.coordinator.completeBake(bakeRequest.requestId, "session-epoch-1", false);
        assert.equal(bakePermit.signal.aborted, true);
        assert.equal(bake.coordinator.getState().endReason, APPROVAL_END_REASON.BAKE_FAILED);
    }),
]);
