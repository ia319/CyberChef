import {fingerprintApprovalAction} from "./ApprovalAction.mjs";
import {copyJsonValue} from "./JsonValue.mjs";

const APPROVAL_TTL_MS = 120_000,
    MAX_APPROVAL_OPERATION_NAMES = 16,
    MAX_APPROVAL_PARAMETER_NAMES = 32,
    MAX_APPROVAL_LABEL_LENGTH = 80,
    APPROVAL_STATE = Object.freeze({
        NONE: "none",
        PENDING: "pending",
        APPROVED: "approved",
        MUTATION_CONSUMED: "mutationConsumed",
        BAKE_AVAILABLE: "bakeAvailable",
        BAKE_CONSUMED: "bakeConsumed",
        COMPLETE: "complete",
        REJECTED: "rejected",
        EXPIRED: "expired",
        CANCELLED: "cancelled",
    }),
    APPROVAL_MODE = Object.freeze({
        RECIPE_ONLY: "recipeOnly",
        RECIPE_AND_BAKE: "recipeAndBake",
    }),
    APPROVAL_CHANGE_TYPE = Object.freeze({
        INSERT: "insert",
        UPDATE: "update",
        REMOVE: "remove",
        MOVE: "move",
        SET_DISABLED: "setDisabled",
        SET_BREAKPOINT: "setBreakpoint",
    }),
    APPROVAL_RISK_FLAG = Object.freeze({
        SECRET_INPUT: "secretInput",
        SENSITIVE_OUTPUT: "sensitiveOutput",
        NETWORK_ACCESS: "networkAccess",
        RICH_CONTENT: "richContent",
        RESOURCE_INTENSIVE: "resourceIntensive",
        BROWSER_SIDE_EFFECT: "browserSideEffect",
    }),
    APPROVAL_END_REASON = Object.freeze({
        USER_REJECTED: "userRejected",
        USER_CANCELLED: "userCancelled",
        EXPIRED: "expired",
        SESSION_ENDED: "sessionEnded",
        PAGE_LIFECYCLE: "pageLifecycle",
        RECIPE_CHANGED: "recipeChanged",
        INPUT_CHANGED: "inputChanged",
        OUTPUT_TARGET_CHANGED: "outputTargetChanged",
        MUTATION_FAILED: "mutationFailed",
        BAKE_FAILED: "bakeFailed",
    }),
    APPROVAL_ERROR_CODE = Object.freeze({
        REQUEST_BUSY: "APPROVAL_REQUEST_BUSY",
        REQUEST_NOT_FOUND: "APPROVAL_REQUEST_NOT_FOUND",
        REQUEST_EXPIRED: "APPROVAL_REQUEST_EXPIRED",
        REQUEST_STATE_MISMATCH: "APPROVAL_REQUEST_STATE_MISMATCH",
        ACTION_MISMATCH: "APPROVAL_ACTION_MISMATCH",
        BAKE_TARGET_MISMATCH: "APPROVAL_BAKE_TARGET_MISMATCH",
        SESSION_MISMATCH: "APPROVAL_SESSION_MISMATCH",
    }),
    TERMINAL_STATES = new Set([
        APPROVAL_STATE.COMPLETE,
        APPROVAL_STATE.REJECTED,
        APPROVAL_STATE.EXPIRED,
        APPROVAL_STATE.CANCELLED,
    ]),
    EXPIRABLE_STATES = new Set([
        APPROVAL_STATE.PENDING,
        APPROVAL_STATE.APPROVED,
        APPROVAL_STATE.BAKE_AVAILABLE,
    ]),
    CHANGE_TYPES = new Set(Object.values(APPROVAL_CHANGE_TYPE)),
    RISK_FLAGS = new Set(Object.values(APPROVAL_RISK_FLAG));


/**
 * Represents an expected approval state or binding failure.
 */
class ApprovalError extends Error {

    /**
     * Creates a bounded approval error.
     *
     * @param {string} code - Stable error code.
     */
    constructor(code) {
        super(code);
        this.name = "ApprovalError";
        this.code = code;
    }
}


/**
 * Validates a collaboration session epoch.
 *
 * @param {*} sessionEpoch - Epoch supplied by the active collaboration session.
 * @returns {number|string} Validated epoch.
 */
function validateSessionEpoch(sessionEpoch) {
    if (Number.isSafeInteger(sessionEpoch) && sessionEpoch >= 0) return sessionEpoch;
    if (typeof sessionEpoch === "string" && sessionEpoch.length > 0 && sessionEpoch.length <= 128) {
        return sessionEpoch;
    }
    throw new TypeError("Approval session epoch is invalid");
}


/**
 * Copies a bounded list of safe UI labels.
 *
 * @param {*} value - Candidate list.
 * @param {string} field - Field name used by bounded validation errors.
 * @param {number} maxItems - Maximum list length.
 * @returns {Array<string>} Frozen detached labels.
 */
function copyLabels(value, field, maxItems) {
    if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) {
        throw new TypeError(`Approval ${field} is invalid`);
    }
    const labels = value.map(label => {
        if (typeof label !== "string" || label.length < 1 || label.length > MAX_APPROVAL_LABEL_LENGTH ||
            /[\u0000-\u001f\u007f]/u.test(label)) {
            throw new TypeError(`Approval ${field} contains an invalid label`);
        }
        return label;
    });
    return Object.freeze(labels);
}


/**
 * Copies a bounded list of fixed contract values.
 *
 * @param {*} value - Candidate list.
 * @param {Set<string>} allowed - Allowed contract values.
 * @param {string} field - Field name used by bounded validation errors.
 * @returns {Array<string>} Frozen detached values.
 */
function copyContractValues(value, allowed, field) {
    if (!Array.isArray(value) || value.length < 1 || value.length > allowed.size ||
        value.some(item => !allowed.has(item)) || new Set(value).size !== value.length) {
        throw new TypeError(`Approval ${field} is invalid`);
    }
    return Object.freeze([...value]);
}


/**
 * Creates the redacted summary that the approval UI may display.
 *
 * @param {*} summary - Locally derived operation and risk labels.
 * @returns {Object} Frozen redacted summary.
 */
function copyApprovalSummary(summary) {
    const {value: safeSummary} = copyJsonValue(summary, 3, 128);
    if (!safeSummary || Object.getPrototypeOf(safeSummary) !== Object.prototype ||
        Reflect.ownKeys(safeSummary).some(key => ![
            "operationNames",
            "changeTypes",
            "sensitiveParameterNames",
            "riskFlags",
        ].includes(key))) {
        throw new TypeError("Approval summary is invalid");
    }

    const sensitiveParameterNames = safeSummary.sensitiveParameterNames ?? [],
        riskFlags = safeSummary.riskFlags ?? [];
    if (!Array.isArray(sensitiveParameterNames) ||
        sensitiveParameterNames.length > MAX_APPROVAL_PARAMETER_NAMES) {
        throw new TypeError("Approval sensitiveParameterNames is invalid");
    }
    if (!Array.isArray(riskFlags) || riskFlags.length > RISK_FLAGS.size ||
        riskFlags.some(flag => !RISK_FLAGS.has(flag)) || new Set(riskFlags).size !== riskFlags.length) {
        throw new TypeError("Approval riskFlags is invalid");
    }

    return Object.freeze({
        operationNames: copyLabels(
            safeSummary.operationNames,
            "operationNames",
            MAX_APPROVAL_OPERATION_NAMES
        ),
        changeTypes: copyContractValues(safeSummary.changeTypes, CHANGE_TYPES, "changeTypes"),
        sensitiveParameterNames: sensitiveParameterNames.length === 0 ? Object.freeze([]) :
            copyLabels(sensitiveParameterNames, "sensitiveParameterNames", MAX_APPROVAL_PARAMETER_NAMES),
        riskFlags: Object.freeze([...riskFlags]),
    });
}


/**
 * Owns one in-memory, page-scoped approval request and its one-use permits.
 */
class ApprovalCoordinator extends EventTarget {

    #request;
    #ttlMs;
    #now;
    #setTimeout;
    #clearTimeout;
    #idFactory;
    #timer;

    /**
     * Creates an approval coordinator with deterministic boundary seams.
     *
     * @param {Object} [options={}] - Clock, timer, identifier, and TTL overrides.
     */
    constructor(options={}) {
        super();

        this.#ttlMs = options.ttlMs ?? APPROVAL_TTL_MS;
        this.#now = options.nowFn ?? Date.now;
        this.#setTimeout = options.setTimeoutFn ?? globalThis.setTimeout.bind(globalThis);
        this.#clearTimeout = options.clearTimeoutFn ?? globalThis.clearTimeout.bind(globalThis);
        this.#idFactory = options.idFactory ?? (() => globalThis.crypto?.randomUUID());
        this.#request = null;
        this.#timer = null;

        if (!Number.isSafeInteger(this.#ttlMs) || this.#ttlMs < 1 ||
            typeof this.#now !== "function" || typeof this.#setTimeout !== "function" ||
            typeof this.#clearTimeout !== "function" || typeof this.#idFactory !== "function") {
            throw new TypeError("Approval coordinator options are invalid");
        }
    }


    /**
     * Returns the redacted approval state for the visible page UI.
     *
     * @returns {Object} Frozen public state without action fingerprints or parameter values.
     */
    getState() {
        this.#expireIfNeeded();
        if (!this.#request) {
            return Object.freeze({
                requestId: null,
                state: APPROVAL_STATE.NONE,
                mode: null,
                expiresAt: null,
                endReason: null,
                summary: null,
            });
        }
        return Object.freeze({
            requestId: this.#request.requestId,
            state: this.#request.state,
            mode: this.#request.mode,
            expiresAt: this.#request.expiresAt,
            endReason: this.#request.endReason,
            summary: this.#request.summary,
        });
    }


    /**
     * Creates or reuses a pending request for one exact action and redacted summary.
     *
     * @param {Object} options - Session epoch, exact action, and safe UI summary.
     * @returns {Promise<Object>} Public pending or approved request state.
     */
    async requestApproval({sessionEpoch, action, summary}) {
        const epoch = validateSessionEpoch(sessionEpoch),
            safeSummary = copyApprovalSummary(summary),
            [actionFingerprint, requestFingerprint] = await Promise.all([
                fingerprintApprovalAction(action),
                fingerprintApprovalAction({action, summary: safeSummary}),
            ]);

        this.#expireIfNeeded();
        if (this.#request && !TERMINAL_STATES.has(this.#request.state)) {
            if (this.#request.sessionEpoch === epoch &&
                this.#request.actionFingerprint === actionFingerprint &&
                this.#request.requestFingerprint === requestFingerprint) {
                return this.getState();
            }
            throw new ApprovalError(APPROVAL_ERROR_CODE.REQUEST_BUSY);
        }

        const requestId = this.#idFactory();
        if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(requestId)) {
            throw new TypeError("Approval request identifier is invalid");
        }

        this.#clearExpiryTimer();
        this.#request = {
            requestId,
            sessionEpoch: epoch,
            actionFingerprint,
            requestFingerprint,
            bakeTargetFingerprint: null,
            state: APPROVAL_STATE.PENDING,
            mode: null,
            expiresAt: this.#now() + this.#ttlMs,
            endReason: null,
            summary: safeSummary,
            controller: new AbortController(),
        };
        this.#timer = this.#setTimeout(() => this.#expireIfNeeded(), this.#ttlMs);
        this.#emitChange();
        return this.getState();
    }


    /**
     * Grants the mutation permit and optionally reserves one exact Bake permit.
     *
     * @param {string} requestId - Opaque page-issued request identifier.
     * @param {number|string} sessionEpoch - Active collaboration epoch.
     * @param {string} mode - User-selected approval mode.
     * @returns {Object} Public approved state.
     */
    approve(requestId, sessionEpoch, mode) {
        const request = this.#requireRequest(requestId, sessionEpoch, APPROVAL_STATE.PENDING);
        if (!Object.values(APPROVAL_MODE).includes(mode)) {
            throw new TypeError("Approval mode is invalid");
        }
        request.mode = mode;
        request.state = APPROVAL_STATE.APPROVED;
        this.#emitChange();
        return this.getState();
    }


    /**
     * Rejects a pending request without granting a permit.
     *
     * @param {string} requestId - Opaque page-issued request identifier.
     * @param {number|string} sessionEpoch - Active collaboration epoch.
     * @returns {Object} Public rejected state.
     */
    reject(requestId, sessionEpoch) {
        this.#requireRequest(requestId, sessionEpoch, APPROVAL_STATE.PENDING);
        this.#end(APPROVAL_STATE.REJECTED, APPROVAL_END_REASON.USER_REJECTED, true);
        return this.getState();
    }


    /**
     * Cancels the current non-terminal request.
     *
     * @param {string} requestId - Opaque page-issued request identifier.
     * @param {number|string} sessionEpoch - Active collaboration epoch.
     * @returns {Object} Public cancelled state.
     */
    cancel(requestId, sessionEpoch) {
        this.#requireRequest(requestId, sessionEpoch);
        this.#end(APPROVAL_STATE.CANCELLED, APPROVAL_END_REASON.USER_CANCELLED, true);
        return this.getState();
    }


    /**
     * Consumes the mutation permit before the Recipe transaction starts.
     *
     * @param {Object} options - Request identity, epoch, and exact action.
     * @returns {Promise<Object>} Internal permit mode and cancellation signal.
     */
    async consumeMutation({requestId, sessionEpoch, action}) {
        const actionFingerprint = await fingerprintApprovalAction(action),
            request = this.#requireRequest(requestId, sessionEpoch, APPROVAL_STATE.APPROVED);
        if (request.actionFingerprint !== actionFingerprint) {
            throw new ApprovalError(APPROVAL_ERROR_CODE.ACTION_MISMATCH);
        }
        request.state = APPROVAL_STATE.MUTATION_CONSUMED;
        this.#emitChange();
        return Object.freeze({mode: request.mode, signal: request.controller.signal});
    }


    /**
     * Settles the mutation and creates the optional Bake permit for its exact target.
     *
     * @param {Object} options - Request identity, outcome, and post-mutation Bake target.
     * @returns {Promise<Object>} Public settled or Bake-available state.
     */
    async completeMutation({requestId, sessionEpoch, succeeded, bakeTarget=null}) {
        let request = this.#requireRequest(
            requestId,
            sessionEpoch,
            APPROVAL_STATE.MUTATION_CONSUMED
        );
        if (typeof succeeded !== "boolean") throw new TypeError("Mutation outcome is invalid");
        if (!succeeded) {
            this.#end(APPROVAL_STATE.CANCELLED, APPROVAL_END_REASON.MUTATION_FAILED, true);
            return this.getState();
        }
        if (request.mode === APPROVAL_MODE.RECIPE_ONLY) {
            this.#end(APPROVAL_STATE.COMPLETE, null, false);
            return this.getState();
        }
        if (bakeTarget === null) throw new TypeError("Approved Bake target is required");

        const bakeTargetFingerprint = await fingerprintApprovalAction(bakeTarget);
        request = this.#requireRequest(
            requestId,
            sessionEpoch,
            APPROVAL_STATE.MUTATION_CONSUMED
        );
        if (this.#now() >= request.expiresAt) {
            this.#end(APPROVAL_STATE.EXPIRED, APPROVAL_END_REASON.EXPIRED, true);
            throw new ApprovalError(APPROVAL_ERROR_CODE.REQUEST_EXPIRED);
        }
        request.bakeTargetFingerprint = bakeTargetFingerprint;
        request.state = APPROVAL_STATE.BAKE_AVAILABLE;
        this.#emitChange();
        return this.getState();
    }


    /**
     * Consumes the Bake permit before work starts for the exact post-mutation target.
     *
     * @param {Object} options - Request identity, epoch, and exact Bake target.
     * @returns {Promise<Object>} Internal cancellation signal for the authorized Bake.
     */
    async consumeBake({requestId, sessionEpoch, bakeTarget}) {
        const bakeTargetFingerprint = await fingerprintApprovalAction(bakeTarget),
            request = this.#requireRequest(requestId, sessionEpoch, APPROVAL_STATE.BAKE_AVAILABLE);
        if (request.bakeTargetFingerprint !== bakeTargetFingerprint) {
            throw new ApprovalError(APPROVAL_ERROR_CODE.BAKE_TARGET_MISMATCH);
        }
        request.state = APPROVAL_STATE.BAKE_CONSUMED;
        this.#clearExpiryTimer();
        this.#emitChange();
        return Object.freeze({signal: request.controller.signal});
    }


    /**
     * Settles a consumed Bake permit after any terminal run outcome.
     *
     * @param {string} requestId - Opaque page-issued request identifier.
     * @param {number|string} sessionEpoch - Active collaboration epoch.
     * @param {boolean} succeeded - Whether the authorized Bake completed successfully.
     * @returns {Object} Public terminal state.
     */
    completeBake(requestId, sessionEpoch, succeeded) {
        this.#requireRequest(requestId, sessionEpoch, APPROVAL_STATE.BAKE_CONSUMED);
        if (typeof succeeded !== "boolean") throw new TypeError("Bake outcome is invalid");
        this.#end(
            succeeded ? APPROVAL_STATE.COMPLETE : APPROVAL_STATE.CANCELLED,
            succeeded ? null : APPROVAL_END_REASON.BAKE_FAILED,
            !succeeded
        );
        return this.getState();
    }


    /**
     * Invalidates every remaining permit for a lifecycle or workspace change.
     *
     * @param {string} reason - Fixed invalidation reason.
     * @returns {Object} Public cancelled state, or the unchanged terminal state.
     */
    invalidate(reason) {
        if (!Object.values(APPROVAL_END_REASON).includes(reason)) {
            throw new TypeError("Approval invalidation reason is invalid");
        }
        if (!this.#request || TERMINAL_STATES.has(this.#request.state)) return this.getState();
        this.#end(APPROVAL_STATE.CANCELLED, reason, true);
        return this.getState();
    }


    /**
     * Resolves a non-terminal request under an exact state and session binding.
     *
     * @param {string} requestId - Opaque request identifier.
     * @param {number|string} sessionEpoch - Active collaboration epoch.
     * @param {string|null} [expectedState=null] - Required current state.
     * @returns {Object} Internal request record.
     */
    #requireRequest(requestId, sessionEpoch, expectedState=null) {
        this.#expireIfNeeded();
        if (!this.#request || this.#request.requestId !== requestId) {
            throw new ApprovalError(APPROVAL_ERROR_CODE.REQUEST_NOT_FOUND);
        }
        if (this.#request.sessionEpoch !== validateSessionEpoch(sessionEpoch)) {
            throw new ApprovalError(APPROVAL_ERROR_CODE.SESSION_MISMATCH);
        }
        if (this.#request.state === APPROVAL_STATE.EXPIRED) {
            throw new ApprovalError(APPROVAL_ERROR_CODE.REQUEST_EXPIRED);
        }
        if (TERMINAL_STATES.has(this.#request.state) ||
            (expectedState !== null && this.#request.state !== expectedState)) {
            throw new ApprovalError(APPROVAL_ERROR_CODE.REQUEST_STATE_MISMATCH);
        }
        return this.#request;
    }


    /**
     * Expires an unused permit after its bounded request lifetime.
     */
    #expireIfNeeded() {
        if (this.#request && EXPIRABLE_STATES.has(this.#request.state) &&
            this.#now() >= this.#request.expiresAt) {
            this.#end(APPROVAL_STATE.EXPIRED, APPROVAL_END_REASON.EXPIRED, true);
        }
    }


    /**
     * Moves the current request to a terminal state.
     *
     * @param {string} state - Terminal approval state.
     * @param {string|null} reason - Fixed terminal reason.
     * @param {boolean} abort - Whether pending authorized work must stop.
     */
    #end(state, reason, abort) {
        this.#request.state = state;
        this.#request.endReason = reason;
        this.#clearExpiryTimer();
        if (abort && !this.#request.controller.signal.aborted) {
            this.#request.controller.abort(new DOMException("Approval ended", "AbortError"));
        }
        this.#emitChange();
    }


    /**
     * Clears the active expiry callback.
     */
    #clearExpiryTimer() {
        if (this.#timer === null) return;
        this.#clearTimeout(this.#timer);
        this.#timer = null;
    }


    /**
     * Notifies the visible approval UI of one state transition.
     */
    #emitChange() {
        this.dispatchEvent(new Event("change"));
    }
}

export {
    APPROVAL_CHANGE_TYPE,
    APPROVAL_END_REASON,
    APPROVAL_ERROR_CODE,
    APPROVAL_MODE,
    APPROVAL_RISK_FLAG,
    APPROVAL_STATE,
    APPROVAL_TTL_MS,
    ApprovalCoordinator,
    ApprovalError,
};
