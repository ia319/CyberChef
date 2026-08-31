import { ToolExecutionError } from "./ToolExecutor.mjs";
import { TOOL_ERROR_CODE } from "./ToolResult.mjs";

const COLLABORATION_SESSION_STATE = Object.freeze({
    UNAVAILABLE: "unavailable",
    OFF: "off",
    ACTIVE: "active",
});
const MAX_SESSION_OUTPUT_ANALYSES = 8;


/**
 * Binds one protected tool invocation to the active collaboration epoch.
 */
class CollaborationInvocation {

    #session;
    #sessionEpoch;
    #invocationSignal;
    #sessionSignal;
    #controller;
    #handleInvocationAbort;
    #handleSessionAbort;

    /**
     * Creates an invocation guard for one active session.
     *
     * @param {CollaborationSession} session - Session that authorized the invocation.
     * @param {number|string} sessionEpoch - Epoch captured at invocation start.
     * @param {AbortSignal} sessionSignal - Signal aborted when the session ends.
     * @param {AbortSignal|undefined} invocationSignal - Browser invocation signal.
     */
    constructor(session, sessionEpoch, sessionSignal, invocationSignal) {
        this.#session = session;
        this.#sessionEpoch = sessionEpoch;
        this.#sessionSignal = sessionSignal;
        this.#invocationSignal = invocationSignal;
        this.#controller = new AbortController();

        this.#handleInvocationAbort = () => {
            this.#controller.abort(this.#invocationSignal.reason);
        };
        this.#handleSessionAbort = () => {
            this.#controller.abort(this.#sessionSignal.reason);
        };

        if (this.#invocationSignal) {
            if (this.#invocationSignal.aborted) {
                this.#handleInvocationAbort();
            } else {
                this.#invocationSignal.addEventListener("abort", this.#handleInvocationAbort, {once: true});
            }
        }

        if (this.#sessionSignal.aborted) {
            this.#handleSessionAbort();
        } else {
            this.#sessionSignal.addEventListener("abort", this.#handleSessionAbort, {once: true});
        }
    }


    /**
     * Returns the epoch captured for this invocation.
     *
     * @returns {number|string} Active collaboration epoch.
     */
    get sessionEpoch() {
        return this.#sessionEpoch;
    }


    /**
     * Returns a signal that follows both invocation and session cancellation.
     *
     * @returns {AbortSignal} Combined invocation signal.
     */
    get signal() {
        return this.#controller.signal;
    }


    /**
     * Creates a cancellable application-work lifetime that survives handler return.
     *
     * @returns {Object} Session-bound signal and idempotent listener cleanup.
     */
    createApplicationWork() {
        this.checkpoint();
        const controller = new AbortController();
        let closed = false;
        const handleInvocationAbort = () => controller.abort(this.#invocationSignal.reason),
            handleSessionAbort = () => controller.abort(this.#sessionSignal.reason),
            close = () => {
                if (closed) return;
                closed = true;
                this.#invocationSignal?.removeEventListener("abort", handleInvocationAbort);
                this.#sessionSignal.removeEventListener("abort", handleSessionAbort);
            };

        if (this.#invocationSignal) {
            if (this.#invocationSignal.aborted) handleInvocationAbort();
            else this.#invocationSignal.addEventListener("abort", handleInvocationAbort, {once: true});
        }
        if (this.#sessionSignal.aborted) handleSessionAbort();
        else this.#sessionSignal.addEventListener("abort", handleSessionAbort, {once: true});

        return Object.freeze({
            signal: controller.signal,
            close,
        });
    }


    /**
     * Consumes one session slot before starting a new Agent-owned Output analysis.
     *
     * Joined and cached analysis requests must not call this method.
     *
     * @returns {void}
     * @throws {ToolExecutionError} When the session ended or its analysis budget is exhausted.
     */
    consumeOutputAnalysis() {
        this.checkpoint();
        this.#session.consumeOutputAnalysis(this.#sessionEpoch);
    }


    /**
     * Rejects cancelled invocations and invocations from an ended session.
     */
    checkpoint() {
        if (this.#invocationSignal?.aborted) throw this.#invocationSignal.reason;
        if (!this.#session.isCurrent(this.#sessionEpoch)) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.SESSION_ENDED);
        }
    }


    /**
     * Releases cancellation listeners after the invocation settles.
     */
    close() {
        if (this.#invocationSignal) {
            this.#invocationSignal.removeEventListener("abort", this.#handleInvocationAbort);
        }
        this.#sessionSignal.removeEventListener("abort", this.#handleSessionAbort);
    }
}


/**
 * Owns the page-scoped Recipe collaboration authorization state.
 */
class CollaborationSession extends EventTarget {

    #state;
    #sessionEpoch;
    #nextSessionEpoch;
    #sessionController;
    #epochFactory;
    #outputAnalysisCount;

    /**
     * Creates a collaboration session controller.
     *
     * @param {boolean} available - Whether the browser exposes the WebMCP provider API.
     * @param {Function|null} [epochFactory=null] - Trusted epoch factory for tests.
     */
    constructor(available, epochFactory=null) {
        super();

        if (typeof available !== "boolean") {
            throw new TypeError("Collaboration availability must be a boolean");
        }
        if (epochFactory !== null && typeof epochFactory !== "function") {
            throw new TypeError("Collaboration epoch factory must be a function");
        }

        this.#state = available ? COLLABORATION_SESSION_STATE.OFF :
            COLLABORATION_SESSION_STATE.UNAVAILABLE;
        this.#sessionEpoch = null;
        this.#nextSessionEpoch = 0;
        this.#sessionController = null;
        this.#epochFactory = epochFactory;
        this.#outputAnalysisCount = 0;
    }


    /**
     * Returns a detached view of the current authorization state.
     *
     * @returns {Object} Current state and active epoch.
     */
    getState() {
        return Object.freeze({
            state: this.#state,
            sessionEpoch: this.#sessionEpoch,
        });
    }


    /**
     * Starts one page-scoped collaboration session.
     *
     * @returns {Object} Active state and new epoch, or the unchanged unavailable state.
     */
    start() {
        if (this.#state !== COLLABORATION_SESSION_STATE.OFF) return this.getState();

        const sessionEpoch = this.#epochFactory ?
            this.#epochFactory() : ++this.#nextSessionEpoch;
        if (!(Number.isSafeInteger(sessionEpoch) && sessionEpoch >= 0) &&
            !(typeof sessionEpoch === "string" && sessionEpoch.length > 0)) {
            throw new TypeError("Collaboration epoch must be a non-negative integer or non-empty string");
        }

        this.#sessionEpoch = sessionEpoch;
        this.#sessionController = new AbortController();
        this.#outputAnalysisCount = 0;
        this.#state = COLLABORATION_SESSION_STATE.ACTIVE;
        this.dispatchEvent(new Event("change"));

        return this.getState();
    }


    /**
     * Ends the active session without changing visible Recipe state.
     *
     * @returns {Object} Current inactive state.
     */
    stop() {
        if (this.#state !== COLLABORATION_SESSION_STATE.ACTIVE) return this.getState();

        const controller = this.#sessionController;
        this.#state = COLLABORATION_SESSION_STATE.OFF;
        this.#sessionEpoch = null;
        this.#sessionController = null;
        this.#outputAnalysisCount = 0;
        controller.abort(new DOMException("Recipe collaboration session ended", "AbortError"));
        this.dispatchEvent(new Event("change"));

        return this.getState();
    }


    /**
     * Returns whether an epoch still identifies the active session.
     *
     * @param {number|string} sessionEpoch - Epoch captured by an invocation.
     * @returns {boolean} Whether the epoch remains active.
     */
    isCurrent(sessionEpoch) {
        return this.#state === COLLABORATION_SESSION_STATE.ACTIVE &&
            this.#sessionEpoch === sessionEpoch;
    }


    /**
     * Atomically accounts for a newly started Output analysis in one active epoch.
     *
     * @param {number|string} sessionEpoch - Epoch captured by the protected invocation.
     * @returns {void}
     * @throws {ToolExecutionError} When the epoch ended or has no remaining analysis slots.
     */
    consumeOutputAnalysis(sessionEpoch) {
        if (!this.isCurrent(sessionEpoch)) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.SESSION_ENDED);
        }
        if (this.#outputAnalysisCount >= MAX_SESSION_OUTPUT_ANALYSES) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.ANALYSIS_BUDGET_EXHAUSTED);
        }
        this.#outputAnalysisCount++;
    }


    /**
     * Creates a guard for one protected tool invocation.
     *
     * @param {AbortSignal|undefined} invocationSignal - Browser invocation signal.
     * @returns {CollaborationInvocation} Invocation guard bound to the active epoch.
     * @throws {ToolExecutionError} When collaboration is inactive.
     */
    createInvocation(invocationSignal) {
        if (this.#state !== COLLABORATION_SESSION_STATE.ACTIVE) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.COLLABORATION_DISABLED);
        }

        return new CollaborationInvocation(
            this,
            this.#sessionEpoch,
            this.#sessionController.signal,
            invocationSignal
        );
    }


    /**
     * Executes a protected handler within one collaboration epoch.
     *
     * @param {Function} handler - Handler that checks its guard before each visible side effect.
     * @param {Object} input - Validated tool input.
     * @param {AbortSignal|undefined} invocationSignal - Browser invocation signal.
     * @returns {Promise<Object>} Handler result from the current session.
     */
    async execute(handler, input, invocationSignal) {
        const invocation = this.createInvocation(invocationSignal);

        try {
            invocation.checkpoint();
            const result = await handler(input, invocation);
            invocation.checkpoint();
            return result;
        } catch (err) {
            invocation.checkpoint();
            throw err;
        } finally {
            invocation.close();
        }
    }
}

export {
    COLLABORATION_SESSION_STATE,
    MAX_SESSION_OUTPUT_ANALYSES,
};
export default CollaborationSession;
