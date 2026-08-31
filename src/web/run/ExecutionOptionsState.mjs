/**
 * Normalizes the options that can alter Chef execution results.
 *
 * @param {Object} options - Current application options.
 * @returns {Object} Immutable execution options snapshot.
 */
function normalizeExecutionOptions(options) {
    const snapshot = {};
    if (typeof options?.returnType === "string" && options.returnType.length > 0) {
        snapshot.returnType = options.returnType;
    }
    return Object.freeze(snapshot);
}


/**
 * Versions immutable snapshots of result-affecting Chef options.
 */
class ExecutionOptionsState {
    #options = Object.freeze({});
    #version = 0;

    /**
     * Captures current execution options and advances the version after a semantic change.
     *
     * @param {Object} options - Current application options.
     * @returns {Object} Immutable options and version.
     */
    capture(options) {
        const snapshot = normalizeExecutionOptions(options);
        if (snapshot.returnType !== this.#options.returnType) {
            if (this.#version === Number.MAX_SAFE_INTEGER) {
                throw new RangeError("Execution options version limit reached");
            }
            this.#options = snapshot;
            this.#version++;
        }
        return Object.freeze({
            options: this.#options,
            version: this.#version,
        });
    }

    /**
     * Checks whether current execution options still match a captured target.
     *
     * @param {Object} target - Captured workspace target.
     * @param {Object} options - Current application options.
     * @returns {boolean} Whether execution options remain current.
     */
    isCurrent(target, options) {
        const current = this.capture(options);
        return target?.executionOptionsVersion === current.version &&
            target.executionOptions?.returnType === current.options.returnType;
    }
}

export {
    ExecutionOptionsState,
};
