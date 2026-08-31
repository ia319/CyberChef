import {RUN_STATE} from "../run/RunCoordinator.mjs";


const ANALYSIS_DECISION = Object.freeze({
    BUSY: "busy",
    CACHED: "cached",
    JOINED: "joined",
    STARTED: "started",
});

const ANALYSIS_OWNER = Object.freeze({
    AGENT: "agent",
    UI: "ui",
});

const ANALYSIS_STATE = Object.freeze({
    CANCELLED: "cancelled",
    FAILED: "failed",
    NO_SUGGESTION: "noSuggestion",
    QUEUED: "queued",
    RUNNING: "running",
    SIGNALS_READY: "signalsReady",
    STALE: "stale",
    TIMED_OUT: "timedOut",
});

const ANALYSIS_WAITER_ERROR_CODE = Object.freeze({
    ABORTED: "ANALYSIS_WAITER_ABORTED",
    INVALID_ANALYSIS: "INVALID_ANALYSIS",
});

const TERMINAL_STATES = new Set([
    ANALYSIS_STATE.CANCELLED,
    ANALYSIS_STATE.FAILED,
    ANALYSIS_STATE.NO_SUGGESTION,
    ANALYSIS_STATE.SIGNALS_READY,
    ANALYSIS_STATE.STALE,
    ANALYSIS_STATE.TIMED_OUT,
]);
const CACHEABLE_STATES = new Set([
    ANALYSIS_STATE.NO_SUGGESTION,
    ANALYSIS_STATE.SIGNALS_READY,
]);
const ANALYSIS_OWNERS = new Set(Object.values(ANALYSIS_OWNER));
const DEFAULT_ANALYSIS_TIMEOUT_MS = 3000;
const MAX_ANALYSIS_HISTORY = 64;


/**
 * Represents a fixed failure while requesting Output analysis.
 */
class AnalysisWaiterError extends Error {
    /**
     * @param {string} code - Fixed waiter error code.
     * @param {string} message - Content-free error message.
     */
    constructor(code, message) {
        super(message);
        this.name = "AnalysisWaiterError";
        this.code = code;
    }
}


/**
 * Checks whether two analysis targets identify the same completed Output.
 *
 * @param {Object} candidate - Existing analysis target.
 * @param {Object} requested - Requested analysis target.
 * @returns {boolean} Whether every Output provenance field matches.
 */
function analysisTargetMatches(candidate, requested) {
    return !!candidate && !!requested &&
        candidate.bakeId === requested.bakeId &&
        candidate.recipeRevision === requested.recipeRevision &&
        candidate.inputTabId === requested.inputTabId &&
        candidate.inputGeneration === requested.inputGeneration &&
        candidate.inputRevision === requested.inputRevision &&
        candidate.outputTabId === requested.outputTabId &&
        candidate.outputGeneration === requested.outputGeneration &&
        candidate.outputVersion === requested.outputVersion &&
        candidate.executionOptionsVersion === requested.executionOptionsVersion &&
        candidate.terminalState === requested.terminalState;
}


/**
 * Copies only the content-free fields that define one completed Output.
 *
 * @param {Object} target - Candidate Output provenance.
 * @returns {Object} Immutable analysis target.
 */
function createAnalysisTarget(target) {
    if (!target || !Number.isSafeInteger(target.bakeId) || target.bakeId < 1 ||
        !Number.isSafeInteger(target.recipeRevision) || target.recipeRevision < 0 ||
        !Number.isSafeInteger(target.inputTabId) || target.inputTabId < 1 ||
        typeof target.inputGeneration !== "string" ||
        !Number.isSafeInteger(target.inputRevision) || target.inputRevision < 0 ||
        !Number.isSafeInteger(target.outputTabId) || target.outputTabId < 1 ||
        !Number.isSafeInteger(target.outputGeneration) || target.outputGeneration < 1 ||
        !Number.isSafeInteger(target.outputVersion) || target.outputVersion < 1 ||
        !Number.isSafeInteger(target.executionOptionsVersion) ||
        target.executionOptionsVersion < 0 || target.terminalState !== RUN_STATE.COMPLETED) {
        throw new AnalysisWaiterError(
            ANALYSIS_WAITER_ERROR_CODE.INVALID_ANALYSIS,
            "Analysis target is invalid"
        );
    }

    return Object.freeze({
        bakeId: target.bakeId,
        recipeRevision: target.recipeRevision,
        inputTabId: target.inputTabId,
        inputGeneration: target.inputGeneration,
        inputRevision: target.inputRevision,
        outputTabId: target.outputTabId,
        outputGeneration: target.outputGeneration,
        outputVersion: target.outputVersion,
        executionOptionsVersion: target.executionOptionsVersion,
        terminalState: target.terminalState,
    });
}


/**
 * Coordinates Output analysis ownership, caching and terminal transitions.
 */
class AnalysisCoordinator {
    #analyses = new Map();
    #clearTimeout;
    #nextAnalysisId = 1;
    #nextWaiterId = 1;
    #onAbandoned;
    #onTimeout;
    #setTimeout;

    /**
     * @param {Object} [options={}] - Coordinator integration options.
     * @param {Function} [options.setTimeoutFn=setTimeout] - Timeout scheduler.
     * @param {Function} [options.clearTimeoutFn=clearTimeout] - Timeout cancellation function.
     * @param {Function|null} [options.onAbandoned=null] - Callback for work with no remaining owner.
     * @param {Function|null} [options.onTimeout=null] - Analysis timeout callback.
     */
    constructor(options={}) {
        this.#setTimeout = options.setTimeoutFn ?? globalThis.setTimeout.bind(globalThis);
        this.#clearTimeout = options.clearTimeoutFn ?? globalThis.clearTimeout.bind(globalThis);
        this.#onAbandoned = options.onAbandoned ?? null;
        this.#onTimeout = options.onTimeout ?? null;
    }

    /**
     * Reuses cached signals, joins matching work or creates an analysis.
     *
     * @param {Object} target - Completed Output provenance.
     * @param {Object} request - Analysis request policy.
     * @param {string} request.owner - Trusted analysis owner.
     * @param {AbortSignal|null} [request.signal=null] - Optional waiter cancellation signal.
     * @param {number} [request.timeoutMs=3000] - Analysis timeout budget.
     * @returns {Object} Decision, content-free snapshot and optional completion Promise.
     */
    ensure(target, request) {
        this.#validateRequest(request);
        const analysisTarget = createAnalysisTarget(target),
            selection = this.#selectDecision(analysisTarget);
        if (selection.decision === ANALYSIS_DECISION.CACHED) {
            return Object.freeze({
                decision: ANALYSIS_DECISION.CACHED,
                analysis: this.#snapshot(selection.analysis),
                completion: Promise.resolve(this.#completion(selection.analysis)),
            });
        }
        if (selection.decision === ANALYSIS_DECISION.JOINED) {
            return Object.freeze({
                decision: ANALYSIS_DECISION.JOINED,
                analysis: this.#snapshot(selection.analysis),
                completion: this.#addWaiter(
                    selection.analysis,
                    request.owner,
                    request.signal
                ),
            });
        }
        if (selection.decision === ANALYSIS_DECISION.BUSY) {
            return Object.freeze({
                decision: ANALYSIS_DECISION.BUSY,
                analysis: this.#snapshot(selection.analysis),
                completion: null,
            });
        }

        const analysis = this.#createAnalysis(analysisTarget, request);
        return Object.freeze({
            decision: ANALYSIS_DECISION.STARTED,
            analysis: this.#snapshot(analysis),
            completion: this.#addWaiter(analysis, request.owner, request.signal),
        });
    }

    /**
     * Reports the current cache and ownership decision without creating an analysis.
     *
     * @param {Object} target - Completed Output provenance.
     * @returns {Object} Scheduling decision and optional existing analysis snapshot.
     */
    getDecision(target) {
        const selection = this.#selectDecision(createAnalysisTarget(target));
        return Object.freeze({
            decision: selection.decision,
            analysis: selection.analysis ? this.#snapshot(selection.analysis) : null,
        });
    }

    /**
     * Marks a queued analysis as running.
     *
     * @param {number} analysisId - Analysis identity.
     * @returns {boolean} Whether the state changed.
     */
    markRunning(analysisId) {
        const analysis = this.#analyses.get(analysisId);
        if (!analysis || analysis.state !== ANALYSIS_STATE.QUEUED) return false;
        analysis.state = ANALYSIS_STATE.RUNNING;
        return true;
    }

    /**
     * Applies the single terminal transition for an analysis.
     *
     * The coordinator treats the value as trusted opaque data and never includes it in snapshots.
     *
     * @param {number} analysisId - Analysis identity.
     * @param {string} terminalState - Final analysis state.
     * @param {*} [value=null] - Trusted internal analysis value.
     * @returns {boolean} Whether the analysis settled.
     */
    settle(analysisId, terminalState, value=null) {
        const analysis = this.#analyses.get(analysisId);
        if (!analysis || !TERMINAL_STATES.has(terminalState)) return false;
        return this.#finish(analysis, terminalState, value);
    }

    /**
     * Returns one immutable content-free analysis snapshot.
     *
     * @param {number} analysisId - Analysis identity.
     * @returns {Object|null} Analysis snapshot or null.
     */
    getAnalysis(analysisId) {
        const analysis = this.#analyses.get(analysisId);
        return analysis ? this.#snapshot(analysis) : null;
    }

    /**
     * Checks whether an analysis can still accept a Worker result.
     *
     * @param {number} analysisId - Analysis identity.
     * @returns {boolean} Whether the analysis is queued or running.
     */
    isActive(analysisId) {
        const analysis = this.#analyses.get(analysisId);
        return !!analysis && !TERMINAL_STATES.has(analysis.state);
    }

    /**
     * Selects analyses that have not reached a terminal state.
     *
     * @returns {Object[]} Active mutable analysis records.
     */
    #activeAnalyses() {
        return [...this.#analyses.values()].filter(analysis =>
            !TERMINAL_STATES.has(analysis.state)
        );
    }

    /**
     * Selects cache reuse, active ownership or a new lifecycle without mutating state.
     *
     * @param {Object} target - Immutable completed Output target.
     * @returns {Object} Decision and matching internal analysis when one exists.
     */
    #selectDecision(target) {
        const cached = this.#findCached(target);
        if (cached) return {decision: ANALYSIS_DECISION.CACHED, analysis: cached};

        const active = this.#activeAnalyses(),
            matching = active.find(analysis => analysisTargetMatches(analysis.target, target));
        if (matching) return {decision: ANALYSIS_DECISION.JOINED, analysis: matching};
        if (active.length) return {decision: ANALYSIS_DECISION.BUSY, analysis: active[0]};
        return {decision: ANALYSIS_DECISION.STARTED, analysis: null};
    }

    /**
     * Attaches one independently cancellable owner to an analysis.
     *
     * @param {Object} analysis - Mutable analysis record.
     * @param {string} owner - Trusted waiter owner.
     * @param {AbortSignal|null} [signal=null] - Optional cancellation signal.
     * @returns {Promise<Object>} Final snapshot and trusted internal value.
     */
    #addWaiter(analysis, owner, signal=null) {
        return new Promise((resolve, reject) => {
            if (this.#nextWaiterId === Number.MAX_SAFE_INTEGER) {
                reject(new RangeError("Analysis waiter identity limit reached"));
                return;
            }
            const waiterId = this.#nextWaiterId++,
                waiter = {owner, resolve, reject, signal, abortHandler: null};

            if (signal) {
                waiter.abortHandler = () => {
                    if (!analysis.waiters.delete(waiterId)) return;
                    reject(new AnalysisWaiterError(
                        ANALYSIS_WAITER_ERROR_CODE.ABORTED,
                        "Analysis waiter was aborted"
                    ));
                    if (analysis.waiters.size === 0 &&
                        !TERMINAL_STATES.has(analysis.state) &&
                        this.#finish(analysis, ANALYSIS_STATE.CANCELLED)) {
                        this.#onAbandoned?.(this.#snapshot(analysis));
                    }
                };
                signal.addEventListener("abort", waiter.abortHandler, {once: true});
            }
            analysis.waiters.set(waiterId, waiter);
        });
    }

    /**
     * Allocates the only mutable record for one analysis lifecycle.
     *
     * @param {Object} target - Immutable completed Output target.
     * @param {Object} request - Validated analysis request.
     * @returns {Object} Mutable internal analysis record.
     */
    #createAnalysis(target, request) {
        if (this.#nextAnalysisId === Number.MAX_SAFE_INTEGER) {
            throw new RangeError("Analysis identity limit reached");
        }
        const analysisId = this.#nextAnalysisId++,
            analysis = {
                analysisId,
                target,
                owner: request.owner,
                state: ANALYSIS_STATE.QUEUED,
                value: null,
                waiters: new Map(),
                timeoutId: null,
            };
        this.#analyses.set(analysisId, analysis);

        const timeoutMs = request.timeoutMs ?? DEFAULT_ANALYSIS_TIMEOUT_MS;
        if (timeoutMs > 0) {
            analysis.timeoutId = this.#setTimeout(() => {
                if (!this.#finish(analysis, ANALYSIS_STATE.TIMED_OUT)) return;
                this.#onTimeout?.(this.#snapshot(analysis));
            }, timeoutMs);
        }
        return analysis;
    }

    /**
     * Finds the newest reusable result for an Output target.
     *
     * @param {Object} target - Requested completed Output target.
     * @returns {Object|null} Cached analysis record or null.
     */
    #findCached(target) {
        const analyses = [...this.#analyses.values()];
        for (let index = analyses.length - 1; index >= 0; index--) {
            const analysis = analyses[index];
            if (CACHEABLE_STATES.has(analysis.state) &&
                analysisTargetMatches(analysis.target, target)) {
                return analysis;
            }
        }
        return null;
    }

    /**
     * Applies a terminal state and settles every remaining owner once.
     *
     * @param {Object} analysis - Mutable analysis record.
     * @param {string} terminalState - Final analysis state.
     * @param {*} [value=null] - Trusted internal analysis value.
     * @returns {boolean} Whether the transition was applied.
     */
    #finish(analysis, terminalState, value=null) {
        if (TERMINAL_STATES.has(analysis.state)) return false;
        analysis.state = terminalState;
        analysis.value = CACHEABLE_STATES.has(terminalState) ? value : null;
        if (analysis.timeoutId !== null) {
            this.#clearTimeout(analysis.timeoutId);
            analysis.timeoutId = null;
        }

        const completion = this.#completion(analysis);
        for (const waiter of analysis.waiters.values()) {
            if (waiter.abortHandler) {
                waiter.signal.removeEventListener("abort", waiter.abortHandler);
            }
            waiter.resolve(completion);
        }
        analysis.waiters.clear();
        this.#pruneHistory();
        return true;
    }

    /**
     * Bounds cached values and content-free analysis history.
     *
     * @returns {void}
     */
    #pruneHistory() {
        const terminalAnalyses = [...this.#analyses.values()]
            .filter(analysis => TERMINAL_STATES.has(analysis.state));
        for (let index = 0; index < terminalAnalyses.length - MAX_ANALYSIS_HISTORY; index++) {
            this.#analyses.delete(terminalAnalyses[index].analysisId);
        }
    }

    /**
     * Creates a completion object for trusted application adapters.
     *
     * @param {Object} analysis - Mutable analysis record.
     * @returns {Object} Immutable completion wrapper.
     */
    #completion(analysis) {
        return Object.freeze({
            analysis: this.#snapshot(analysis),
            value: analysis.value,
        });
    }

    /**
     * Projects lifecycle state without exposing the analysis value.
     *
     * @param {Object} analysis - Mutable analysis record.
     * @returns {Object} Immutable content-free snapshot.
     */
    #snapshot(analysis) {
        return Object.freeze({
            analysisId: analysis.analysisId,
            owner: analysis.owner,
            target: analysis.target,
            state: analysis.state,
            terminalState: TERMINAL_STATES.has(analysis.state) ? analysis.state : null,
        });
    }

    /**
     * Rejects malformed policy before allocating an analysis identity.
     *
     * @param {Object} request - Candidate analysis request.
     * @returns {void}
     * @throws {AnalysisWaiterError} When the request is invalid.
     */
    #validateRequest(request) {
        if (request?.signal?.aborted) {
            throw new AnalysisWaiterError(
                ANALYSIS_WAITER_ERROR_CODE.ABORTED,
                "Analysis waiter was aborted"
            );
        }
        if (!request || !ANALYSIS_OWNERS.has(request.owner) ||
            (request.signal !== undefined && request.signal !== null &&
                (typeof request.signal.aborted !== "boolean" ||
                    typeof request.signal.addEventListener !== "function" ||
                    typeof request.signal.removeEventListener !== "function")) ||
            (request.timeoutMs !== undefined &&
                (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 0))) {
            throw new AnalysisWaiterError(
                ANALYSIS_WAITER_ERROR_CODE.INVALID_ANALYSIS,
                "Analysis request is invalid"
            );
        }
    }
}


export {
    ANALYSIS_DECISION,
    ANALYSIS_OWNER,
    ANALYSIS_STATE,
    ANALYSIS_WAITER_ERROR_CODE,
    AnalysisCoordinator,
    AnalysisWaiterError,
    DEFAULT_ANALYSIS_TIMEOUT_MS,
    analysisTargetMatches,
    createAnalysisTarget,
};
