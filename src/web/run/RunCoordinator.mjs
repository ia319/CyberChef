const RUN_DECISION = Object.freeze({
    ALREADY_FRESH: "alreadyFresh",
    BUSY: "busy",
    JOINED: "joined",
    STARTED: "started",
});

const RUN_OWNER = Object.freeze({
    AGENT: "agent",
    SYSTEM: "system",
    USER: "user",
});

const RUN_MODE = Object.freeze({
    AGENT: "agent",
    AUTO: "auto",
    INITIAL: "initial",
    MANUAL: "manual",
    SILENT: "silent",
    STEP: "step",
});

const RUN_STATE = Object.freeze({
    CANCELLED: "cancelled",
    COMPLETED: "completed",
    FAILED: "failed",
    PAUSED: "paused",
    QUEUED: "queued",
    RUNNING: "running",
    SUPERSEDED: "superseded",
    TIMED_OUT: "timedOut",
});

const RUN_FAILURE_KIND = Object.freeze({
    EXPECTED: "expected",
    FATAL: "fatal",
    MESSAGE: "message",
    PROTOCOL: "protocol",
    QUEUE: "queue",
    WORKER: "worker",
});

const RUN_WAITER_ERROR_CODE = Object.freeze({
    ABORTED: "RUN_WAITER_ABORTED",
    INVALID_RUN: "INVALID_RUN",
});

const TERMINAL_STATES = new Set([
    RUN_STATE.CANCELLED,
    RUN_STATE.COMPLETED,
    RUN_STATE.FAILED,
    RUN_STATE.PAUSED,
    RUN_STATE.SUPERSEDED,
    RUN_STATE.TIMED_OUT,
]);
const SETTLED_INPUT_STATES = new Set([
    RUN_STATE.COMPLETED,
    RUN_STATE.FAILED,
    RUN_STATE.PAUSED,
]);
const RUN_MODES = new Set(Object.values(RUN_MODE));
const RUN_OWNERS = new Set(Object.values(RUN_OWNER));
const DEFAULT_RUN_TIMEOUT_MS = 120000;
const MAX_RUN_HISTORY = 64;


/**
 * Represents a fixed failure while joining a Run.
 */
class RunWaiterError extends Error {
    /**
     * @param {string} code - Fixed waiter error code.
     * @param {string} message - Content-free error message.
     */
    constructor(code, message) {
        super(message);
        this.name = "RunWaiterError";
        this.code = code;
    }
}


/**
 * Checks whether an existing Run covers a requested execution target.
 *
 * @param {Object} candidate - Existing bound Run target.
 * @param {Object} requested - Requested workspace target.
 * @returns {boolean} Whether every requested Output has the same execution provenance.
 */
function targetCovers(candidate, requested) {
    if (!candidate || !requested ||
        candidate.recipeRevisionAtStart !== requested.recipeRevisionAtStart ||
        candidate.executionOptionsVersion !== requested.executionOptionsVersion ||
        candidate.executionOptions?.returnType !== requested.executionOptions?.returnType ||
        candidate.progress !== requested.progress || candidate.step !== requested.step ||
        !Array.isArray(candidate.inputTargets) || !Array.isArray(requested.inputTargets) ||
        requested.inputTargets.length < 1) {
        return false;
    }

    return requested.inputTargets.every(requestedInput =>
        candidate.inputTargets.some(candidateInput =>
            candidateInput.inputTabId === requestedInput.inputTabId &&
            candidateInput.inputGeneration === requestedInput.inputGeneration &&
            candidateInput.inputRevision === requestedInput.inputRevision &&
            candidateInput.outputTabId === requestedInput.outputTabId &&
            candidateInput.outputGeneration === requestedInput.outputGeneration
        )
    );
}


/**
 * Coordinates immutable Run records, completion waiters and terminal transitions.
 */
class RunCoordinator {
    #clearTimeout;
    #nextBakeId = 1;
    #nextWaiterId = 1;
    #onExclusiveAgentAbort;
    #onTimeout;
    #runs = new Map();
    #setTimeout;

    /**
     * @param {Object} [options={}] - Coordinator integration options.
     * @param {Function} [options.setTimeoutFn=setTimeout] - Timeout scheduler.
     * @param {Function} [options.clearTimeoutFn=clearTimeout] - Timeout cancellation function.
     * @param {Function|null} [options.onExclusiveAgentAbort=null] - Agent-only abort callback.
     * @param {Function|null} [options.onTimeout=null] - Run timeout callback.
     */
    constructor(options={}) {
        this.#setTimeout = options.setTimeoutFn ?? setTimeout;
        this.#clearTimeout = options.clearTimeoutFn ?? clearTimeout;
        this.#onExclusiveAgentAbort = options.onExclusiveAgentAbort ?? null;
        this.#onTimeout = options.onTimeout ?? null;
    }

    /**
     * Reuses fresh work, joins matching work or creates a new Run.
     *
     * @param {Object} target - Immutable workspace target.
     * @param {Object} request - Run request policy.
     * @param {string} request.owner - Trusted Run owner.
     * @param {string} request.mode - Run mode.
     * @param {AbortSignal|null} [request.signal=null] - Optional waiter cancellation signal.
     * @param {number} [request.timeoutMs=120000] - Run timeout budget.
     * @returns {Object} Decision, content-free Run snapshot and optional completion Promise.
     */
    ensure(target, request) {
        this.#validateRequest(target, request);

        const fresh = this.#findFreshRun(target);
        if (fresh) {
            return Object.freeze({
                decision: RUN_DECISION.ALREADY_FRESH,
                run: this.#snapshot(fresh),
                completion: Promise.resolve(this.#snapshot(fresh)),
            });
        }

        const activeRuns = this.#activeRuns(request.mode),
            matching = activeRuns.find(run => targetCovers(run.target, target));
        if (matching) {
            return Object.freeze({
                decision: RUN_DECISION.JOINED,
                run: this.#snapshot(matching),
                completion: this.#addWaiter(matching, request.owner, request.signal),
            });
        }
        if (activeRuns.length > 0) {
            return Object.freeze({
                decision: RUN_DECISION.BUSY,
                run: this.#snapshot(activeRuns[0]),
                completion: null,
            });
        }

        const run = this.#createRun(target, request);
        return Object.freeze({
            decision: RUN_DECISION.STARTED,
            run: this.#snapshot(run),
            completion: this.#addWaiter(run, request.owner, request.signal),
        });
    }

    /**
     * Marks a queued Run or one of its Inputs as running.
     *
     * @param {number} bakeId - Run identity.
     * @param {number|null} [inputTabId=null] - Optional Input identity.
     * @returns {boolean} Whether the state changed.
     */
    markRunning(bakeId, inputTabId=null) {
        const run = this.#runs.get(bakeId);
        if (!run || TERMINAL_STATES.has(run.state)) return false;

        let changed = false;
        if (run.state === RUN_STATE.QUEUED) {
            run.state = RUN_STATE.RUNNING;
            run.startedAt = Date.now();
            changed = true;
        }
        if (inputTabId !== null) {
            const input = run.inputs.get(inputTabId);
            if (!input || input.state !== RUN_STATE.QUEUED) return changed;
            input.state = RUN_STATE.RUNNING;
            changed = true;
        }
        return changed;
    }

    /**
     * Settles one Input and completes its Run after every Input settles.
     *
     * @param {number} bakeId - Run identity.
     * @param {number} inputTabId - Input identity.
     * @param {Object} outcome - Input execution outcome.
     * @param {string} outcome.state - Completed, paused or failed state.
     * @param {string|null} [outcome.failureKind=null] - Fixed failure classification.
     * @param {string|null} [outcome.presenter=null] - Presenter Operation name.
     * @returns {boolean} Whether the Input settled.
     */
    settleInput(bakeId, inputTabId, outcome) {
        const run = this.#runs.get(bakeId),
            input = run?.inputs.get(inputTabId);
        if (!run || TERMINAL_STATES.has(run.state) || !input ||
            input.state === RUN_STATE.COMPLETED || input.state === RUN_STATE.FAILED ||
            input.state === RUN_STATE.PAUSED || !SETTLED_INPUT_STATES.has(outcome?.state) ||
            (outcome.state === RUN_STATE.FAILED &&
                !Object.values(RUN_FAILURE_KIND).includes(outcome.failureKind))) {
            return false;
        }

        input.state = outcome.state;
        input.failureKind = outcome.failureKind ?? null;
        input.presenter = typeof outcome.presenter === "string" ? outcome.presenter : null;

        if ([...run.inputs.values()].every(item => SETTLED_INPUT_STATES.has(item.state))) {
            const inputs = [...run.inputs.values()];
            if (inputs.some(item => item.state === RUN_STATE.FAILED)) {
                this.#finish(run, RUN_STATE.FAILED);
            } else if (inputs.some(item => item.state === RUN_STATE.PAUSED)) {
                this.#finish(run, RUN_STATE.PAUSED);
            } else {
                this.#finish(run, RUN_STATE.COMPLETED);
            }
        }
        return true;
    }

    /**
     * Settles a Run without waiting for per-Input completion.
     *
     * @param {number} bakeId - Run identity.
     * @param {string} terminalState - Terminal Run state.
     * @param {string|null} [failureKind=null] - Fixed failure classification.
     * @returns {boolean} Whether the Run settled.
     */
    settle(bakeId, terminalState, failureKind=null) {
        const run = this.#runs.get(bakeId);
        if (!run || !TERMINAL_STATES.has(terminalState) ||
            (terminalState === RUN_STATE.FAILED &&
                !Object.values(RUN_FAILURE_KIND).includes(failureKind))) {
            return false;
        }
        return this.#finish(run, terminalState, failureKind);
    }

    /**
     * Returns one immutable Run snapshot.
     *
     * @param {number} bakeId - Run identity.
     * @returns {Object|null} Run snapshot or null.
     */
    getRun(bakeId) {
        const run = this.#runs.get(bakeId);
        return run ? this.#snapshot(run) : null;
    }

    /**
     * Checks whether a Run can still accept Worker actions.
     *
     * @param {number} bakeId - Run identity.
     * @returns {boolean} Whether the Run is queued or running.
     */
    isActive(bakeId) {
        const run = this.#runs.get(bakeId);
        return !!run && !TERMINAL_STATES.has(run.state);
    }

    /**
     * Selects active Runs from the visible or silent scheduling lane.
     *
     * @param {string} mode - Requested Run mode.
     * @returns {Object[]} Matching mutable Run records.
     */
    #activeRuns(mode) {
        const silent = mode === RUN_MODE.SILENT;
        return [...this.#runs.values()].filter(run =>
            !TERMINAL_STATES.has(run.state) && (run.mode === RUN_MODE.SILENT) === silent
        );
    }

    /**
     * Attaches one independently cancellable completion waiter.
     *
     * @param {Object} run - Mutable Run record.
     * @param {string} owner - Trusted waiter owner.
     * @param {AbortSignal|null} [signal=null] - Optional invocation signal.
     * @returns {Promise<Object>} Final immutable Run snapshot.
     */
    #addWaiter(run, owner, signal=null) {
        return new Promise((resolve, reject) => {
            if (this.#nextWaiterId === Number.MAX_SAFE_INTEGER) {
                reject(new RangeError("Run waiter identity limit reached"));
                return;
            }
            const waiterId = this.#nextWaiterId++,
                waiter = {owner, resolve, reject, signal, abortHandler: null};
            if (signal?.aborted) {
                reject(new RunWaiterError(
                    RUN_WAITER_ERROR_CODE.ABORTED,
                    "Run waiter was aborted"
                ));
                return;
            }

            if (signal) {
                waiter.abortHandler = () => {
                    if (!run.waiters.delete(waiterId)) return;
                    reject(new RunWaiterError(
                        RUN_WAITER_ERROR_CODE.ABORTED,
                        "Run waiter was aborted"
                    ));
                    if (run.owner === RUN_OWNER.AGENT && run.waiters.size === 0 &&
                        !TERMINAL_STATES.has(run.state)) {
                        this.#onExclusiveAgentAbort?.(this.#snapshot(run));
                    }
                };
                signal.addEventListener("abort", waiter.abortHandler, {once: true});
            }
            run.waiters.set(waiterId, waiter);
        });
    }

    /**
     * Allocates the only mutable record for one execution lifecycle.
     *
     * @param {Object} target - Immutable workspace target.
     * @param {Object} request - Validated Run request.
     * @returns {Object} Mutable internal Run record.
     */
    #createRun(target, request) {
        if (this.#nextBakeId === Number.MAX_SAFE_INTEGER) {
            throw new RangeError("Run identity limit reached");
        }
        const bakeId = this.#nextBakeId++,
            boundTarget = Object.freeze({...target, bakeId}),
            inputs = new Map((target.inputTargets ?? []).map(inputTarget => [
                inputTarget.inputTabId,
                {
                    inputTabId: inputTarget.inputTabId,
                    outputTabId: inputTarget.outputTabId,
                    state: RUN_STATE.QUEUED,
                    failureKind: null,
                    presenter: null,
                },
            ])),
            run = {
                bakeId,
                target: boundTarget,
                owner: request.owner,
                mode: request.mode,
                state: RUN_STATE.QUEUED,
                failureKind: null,
                createdAt: Date.now(),
                startedAt: null,
                settledAt: null,
                inputs,
                waiters: new Map(),
                timeoutId: null,
            };
        this.#runs.set(bakeId, run);

        const timeoutMs = request.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
        if (timeoutMs > 0) {
            run.timeoutId = this.#setTimeout(() => {
                if (!this.#finish(run, RUN_STATE.TIMED_OUT)) return;
                this.#onTimeout?.(this.#snapshot(run));
            }, timeoutMs);
        }
        return run;
    }

    /**
     * Finds the newest completed per-Input result covering a target.
     *
     * @param {Object} target - Requested workspace target.
     * @returns {Object|null} Matching internal Run or null.
     */
    #findFreshRun(target) {
        const runs = [...this.#runs.values()];
        for (let index = runs.length - 1; index >= 0; index--) {
            const run = runs[index];
            if (!TERMINAL_STATES.has(run.state) || !targetCovers(run.target, target)) continue;
            if (target.inputTargets.every(inputTarget =>
                run.inputs.get(inputTarget.inputTabId)?.state === RUN_STATE.COMPLETED
            )) {
                return run;
            }
        }
        return null;
    }

    /**
     * Applies the single terminal transition and settles every waiter.
     *
     * @param {Object} run - Mutable Run record.
     * @param {string} terminalState - Final Run state.
     * @param {string|null} [failureKind=null] - Fixed failure classification.
     * @returns {boolean} Whether the transition was applied.
     */
    #finish(run, terminalState, failureKind=null) {
        if (TERMINAL_STATES.has(run.state)) return false;
        run.state = terminalState;
        run.failureKind = failureKind ??
            [...run.inputs.values()].find(input => input.failureKind)?.failureKind ?? null;
        for (const input of run.inputs.values()) {
            if (SETTLED_INPUT_STATES.has(input.state)) continue;
            input.state = terminalState;
            input.failureKind = failureKind;
        }
        run.settledAt = Date.now();
        if (run.timeoutId !== null) {
            this.#clearTimeout(run.timeoutId);
            run.timeoutId = null;
        }

        for (const waiter of run.waiters.values()) {
            if (waiter.abortHandler) {
                waiter.signal.removeEventListener("abort", waiter.abortHandler);
            }
            waiter.resolve(this.#snapshot(run));
        }
        run.waiters.clear();
        this.#pruneHistory();
        return true;
    }

    /**
     * Bounds content-free completion history used for fresh-result reuse.
     *
     * @returns {void}
     */
    #pruneHistory() {
        const terminalRuns = [...this.#runs.values()]
            .filter(run => TERMINAL_STATES.has(run.state));
        for (let index = 0; index < terminalRuns.length - MAX_RUN_HISTORY; index++) {
            this.#runs.delete(terminalRuns[index].bakeId);
        }
    }

    /**
     * Projects a JSON-safe view without exposing mutable coordinator state.
     *
     * @param {Object} run - Mutable Run record.
     * @returns {Object} Immutable content-free Run snapshot.
     */
    #snapshot(run) {
        return Object.freeze({
            bakeId: run.bakeId,
            owner: run.owner,
            mode: run.mode,
            target: run.target,
            state: run.state,
            terminalState: TERMINAL_STATES.has(run.state) ? run.state : null,
            failureKind: run.failureKind,
            createdAt: run.createdAt,
            startedAt: run.startedAt,
            settledAt: run.settledAt,
            inputs: Object.freeze([...run.inputs.values()].map(input => Object.freeze({...input}))),
        });
    }

    /**
     * Rejects malformed policy before allocating a Run identity.
     *
     * @param {Object} target - Candidate workspace target.
     * @param {Object} request - Candidate Run request.
     * @returns {void}
     * @throws {RunWaiterError} When the request is invalid.
     */
    #validateRequest(target, request) {
        if (request?.signal?.aborted) {
            throw new RunWaiterError(
                RUN_WAITER_ERROR_CODE.ABORTED,
                "Run waiter was aborted"
            );
        }
        if (!target || Object.prototype.hasOwnProperty.call(target, "bakeId") ||
            !request || !RUN_OWNERS.has(request.owner) || !RUN_MODES.has(request.mode) ||
            (request.signal !== undefined && request.signal !== null &&
                (typeof request.signal.aborted !== "boolean" ||
                    typeof request.signal.addEventListener !== "function" ||
                    typeof request.signal.removeEventListener !== "function")) ||
            (request.mode !== RUN_MODE.SILENT &&
                (!Array.isArray(target.inputTargets) || target.inputTargets.length < 1)) ||
            (request.timeoutMs !== undefined &&
                (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 0))) {
            throw new RunWaiterError(
                RUN_WAITER_ERROR_CODE.INVALID_RUN,
                "Run request is invalid"
            );
        }
    }
}

export {
    DEFAULT_RUN_TIMEOUT_MS,
    RUN_DECISION,
    RUN_FAILURE_KIND,
    RUN_MODE,
    RUN_OWNER,
    RUN_STATE,
    RUN_WAITER_ERROR_CODE,
    RunCoordinator,
    RunWaiterError,
    targetCovers,
};
