const INPUT_SYNC_RESULT_CODE = Object.freeze({
    SYNCED: "SYNCED",
    INPUT_REPLACED: "INPUT_REPLACED",
    INPUT_REMOVED: "INPUT_REMOVED",
    RESET: "RESET",
    REJECTED: "REJECTED",
});


/**
 * Validates one content-free Input identity record.
 *
 * @param {Object} state - Input identity from the InputWorker.
 * @returns {void}
 * @throws {TypeError} When the identity record is invalid.
 */
function validateInputState(state) {
    if (!state || !Number.isSafeInteger(state.inputNum) || state.inputNum < 1 ||
        typeof state.inputGeneration !== "string" ||
        !/^\d+:\d+$/.test(state.inputGeneration) ||
        !Number.isSafeInteger(state.inputRevision) || state.inputRevision < 0) {
        throw new TypeError("Input identity is invalid");
    }
}


/**
 * Tracks main-thread Input identities and settles InputWorker update acknowledgements.
 */
class InputSyncController {
    #inputs = new Map();
    #pending = new Map();
    #nextSyncId = 1;

    /**
     * Returns the current immutable identity for one Input.
     *
     * @param {number} inputNum - Input number.
     * @returns {Object|null} Current identity or null.
     */
    getState(inputNum) {
        return this.#inputs.get(inputNum) ?? null;
    }

    /**
     * Registers a Worker-confirmed Input identity.
     *
     * @param {Object} state - Input identity from the InputWorker.
     * @returns {Object} Registered immutable identity.
     * @throws {RangeError} When a Worker attempts to move a revision backwards.
     */
    registerState(state) {
        validateInputState(state);
        const current = this.#inputs.get(state.inputNum);

        if (current?.inputGeneration === state.inputGeneration &&
            state.inputRevision < current.inputRevision) {
            throw new RangeError("Input revision cannot move backwards");
        }
        if (current && current.inputGeneration !== state.inputGeneration) {
            this.#settleInput(state.inputNum, INPUT_SYNC_RESULT_CODE.INPUT_REPLACED);
        }

        const registered = Object.freeze({
            inputNum: state.inputNum,
            inputGeneration: state.inputGeneration,
            inputRevision: state.inputRevision,
        });
        this.#inputs.set(state.inputNum, registered);
        return registered;
    }

    /**
     * Starts one generation-bound Input update request.
     *
     * @param {number} inputNum - Input number.
     * @returns {{request: Object, completion: Promise<Object>}} Request identity and completion.
     * @throws {RangeError} When the Input is unknown or request identities are exhausted.
     */
    startUpdate(inputNum) {
        const state = this.#inputs.get(inputNum);
        if (!state) throw new RangeError("Input identity is unavailable");
        if (this.#nextSyncId === Number.MAX_SAFE_INTEGER) {
            throw new RangeError("Input sync identity limit reached");
        }

        const syncId = this.#nextSyncId++;
        let settle;
        const completion = new Promise(resolve => {
            settle = resolve;
        });
        this.#pending.set(syncId, {
            inputNum,
            inputGeneration: state.inputGeneration,
            settle,
        });

        return Object.freeze({
            request: Object.freeze({
                syncId,
                inputNum,
                inputGeneration: state.inputGeneration,
            }),
            completion,
        });
    }

    /**
     * Settles one InputWorker update acknowledgement.
     *
     * @param {Object} acknowledgement - Content-free Worker acknowledgement.
     * @returns {boolean} Whether a matching request was settled.
     */
    acknowledge(acknowledgement) {
        const pending = this.#pending.get(acknowledgement?.syncId);
        if (!pending) return false;

        if (acknowledgement.applied !== true ||
            acknowledgement.inputNum !== pending.inputNum ||
            acknowledgement.inputGeneration !== pending.inputGeneration) {
            this.#pending.delete(acknowledgement.syncId);
            pending.settle(Object.freeze({
                ok: false,
                code: INPUT_SYNC_RESULT_CODE.REJECTED,
                state: null,
            }));
            return true;
        }

        let state;
        try {
            state = this.registerState(acknowledgement);
        } catch {
            this.#pending.delete(acknowledgement.syncId);
            pending.settle(Object.freeze({
                ok: false,
                code: INPUT_SYNC_RESULT_CODE.REJECTED,
                state: null,
            }));
            return true;
        }
        this.#pending.delete(acknowledgement.syncId);
        pending.settle(Object.freeze({
            ok: true,
            code: INPUT_SYNC_RESULT_CODE.SYNCED,
            state,
        }));
        return true;
    }

    /**
     * Removes one Input identity and settles its pending updates.
     *
     * @param {number} inputNum - Removed Input number.
     * @returns {void}
     */
    removeState(inputNum) {
        this.#settleInput(inputNum, INPUT_SYNC_RESULT_CODE.INPUT_REMOVED);
        this.#inputs.delete(inputNum);
    }

    /**
     * Invalidates all identities when the InputWorker lifecycle changes.
     *
     * @returns {void}
     */
    reset() {
        for (const pending of this.#pending.values()) {
            pending.settle(Object.freeze({
                ok: false,
                code: INPUT_SYNC_RESULT_CODE.RESET,
                state: null,
            }));
        }
        this.#pending.clear();
        this.#inputs.clear();
    }

    /**
     * Settles pending updates for one Input without exposing submitted content.
     *
     * @param {number} inputNum - Input number.
     * @param {string} code - Fixed result code.
     * @returns {void}
     */
    #settleInput(inputNum, code) {
        for (const [syncId, pending] of this.#pending) {
            if (pending.inputNum !== inputNum) continue;
            this.#pending.delete(syncId);
            pending.settle(Object.freeze({ok: false, code, state: null}));
        }
    }
}

export {
    INPUT_SYNC_RESULT_CODE,
    InputSyncController,
};
