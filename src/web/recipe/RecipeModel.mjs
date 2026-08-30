const RECIPE_MODEL_VERSION = "1";
const MAX_STEP_ID_LENGTH = 64;
const STEP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;


/**
 * Copies a Recipe argument without retaining caller-owned objects.
 *
 * @param {*} value - JSON-compatible Recipe argument value.
 * @returns {*} Independent argument value.
 */
function cloneArgument(value) {
    if (Array.isArray(value)) return value.map(cloneArgument);
    if (value === null || ["string", "number", "boolean", "undefined"].includes(typeof value)) {
        return value;
    }
    if (typeof value !== "object") {
        throw new TypeError("Recipe arguments must contain data values");
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("Recipe arguments must contain plain objects");
    }

    const clone = {};
    for (const key of Object.keys(value)) {
        Object.defineProperty(clone, key, {
            value: cloneArgument(value[key]),
            enumerable: true,
            configurable: true,
            writable: true,
        });
    }
    return clone;
}


/**
 * Freezes a Recipe argument and its nested values.
 *
 * @param {*} value - Independent Recipe argument value.
 * @returns {*} Immutable argument value.
 */
function freezeArgument(value) {
    if (Array.isArray(value)) {
        for (const item of value) freezeArgument(item);
        return Object.freeze(value);
    }
    if (value !== null && typeof value === "object") {
        for (const item of Object.values(value)) freezeArgument(item);
        return Object.freeze(value);
    }
    return value;
}


/**
 * Normalizes one existing CyberChef Recipe configuration item.
 *
 * @param {Object} config - Recipe configuration item.
 * @returns {Object} Immutable compatible configuration item.
 */
function normalizeOperationConfig(config) {
    if (!config || typeof config !== "object" || Array.isArray(config) ||
        typeof config.op !== "string" || !Array.isArray(config.args)) {
        throw new TypeError("Recipe Operation configuration is invalid");
    }

    const normalized = {
        op: config.op,
        args: freezeArgument(config.args.map(value => cloneArgument(value))),
    };
    if (config.disabled === true) normalized.disabled = true;
    if (config.breakpoint === true) normalized.breakpoint = true;
    return Object.freeze(normalized);
}


/**
 * Compares nested Recipe values without serialization side effects.
 *
 * @param {*} left - First value.
 * @param {*} right - Second value.
 * @returns {boolean} Whether both values are equivalent.
 */
function recipeValuesEqual(left, right) {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
        return Array.isArray(left) && Array.isArray(right) &&
            left.length === right.length &&
            left.every((value, index) => recipeValuesEqual(value, right[index]));
    }
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;

    const leftKeys = Object.keys(left),
        rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length &&
        leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) &&
            recipeValuesEqual(left[key], right[key]));
}


/**
 * Stores Recipe semantics separately from their visible DOM projection.
 */
class RecipeModel {
    #steps;
    #recipeRevision;
    #nextStepNumber;
    #allocatedStepIds;
    #stepIdFactory;

    /**
     * Creates an empty page-lifetime Recipe model.
     *
     * @param {Function|null} [stepIdFactory=null] - Trusted step identifier factory for tests.
     */
    constructor(stepIdFactory=null) {
        if (stepIdFactory !== null && typeof stepIdFactory !== "function") {
            throw new TypeError("Recipe step ID factory must be a function");
        }

        this.#steps = Object.freeze([]);
        this.#recipeRevision = 0;
        this.#nextStepNumber = 0;
        this.#allocatedStepIds = new Set();
        this.#stepIdFactory = stepIdFactory ?? (() => `recipe-step-${++this.#nextStepNumber}`);
    }


    /**
     * Allocates one page-lifetime identifier that is never reused by this model.
     *
     * @returns {string} New Recipe step identifier.
     */
    allocateStepId() {
        const stepId = this.#stepIdFactory();
        if (typeof stepId !== "string" || stepId.length < 1 ||
            stepId.length > MAX_STEP_ID_LENGTH || !STEP_ID_PATTERN.test(stepId)) {
            throw new TypeError("Recipe step ID is invalid");
        }
        if (this.#allocatedStepIds.has(stepId)) {
            throw new RangeError("Recipe step ID has already been allocated");
        }
        this.#allocatedStepIds.add(stepId);
        return stepId;
    }


    /**
     * Commits a complete projected Recipe and advances revision once when semantics changed.
     *
     * @param {Object[]} projectedSteps - Ordered runtime identities and Operation configurations.
     * @returns {Object} Immutable commit result.
     */
    commitProjectedSteps(projectedSteps) {
        if (!Array.isArray(projectedSteps)) {
            throw new TypeError("Projected Recipe steps must be an array");
        }

        const stepIds = new Set(),
            normalizedSteps = projectedSteps.map(step => {
                if (!step || typeof step !== "object" || Array.isArray(step) ||
                    typeof step.stepId !== "string" || !this.#allocatedStepIds.has(step.stepId)) {
                    throw new TypeError("Projected Recipe step is invalid");
                }
                if (stepIds.has(step.stepId)) {
                    throw new RangeError("Projected Recipe contains a duplicate step ID");
                }
                stepIds.add(step.stepId);
                return Object.freeze({
                    stepId: step.stepId,
                    operation: normalizeOperationConfig(step.operation),
                });
            }),
            changed = normalizedSteps.length !== this.#steps.length ||
                normalizedSteps.some((step, index) => step.stepId !== this.#steps[index].stepId ||
                    !recipeValuesEqual(step.operation, this.#steps[index].operation));

        if (!changed) {
            return Object.freeze({changed: false, recipeRevision: this.#recipeRevision});
        }
        if (this.#recipeRevision === Number.MAX_SAFE_INTEGER) {
            throw new RangeError("Recipe revision limit reached");
        }

        this.#steps = Object.freeze(normalizedSteps);
        this.#recipeRevision++;
        return Object.freeze({changed: true, recipeRevision: this.#recipeRevision});
    }


    /**
     * Returns immutable runtime state for trusted Recipe services.
     *
     * @returns {Object} Recipe revision and ordered runtime steps.
     */
    getSnapshot() {
        return Object.freeze({
            version: RECIPE_MODEL_VERSION,
            recipeRevision: this.#recipeRevision,
            steps: this.#steps,
        });
    }


    /**
     * Exports the existing CyberChef Recipe configuration without runtime identity.
     *
     * @returns {Object[]} Independent compatible Recipe configuration.
     */
    exportConfig() {
        return this.#steps.map(step => {
            const config = {
                op: step.operation.op,
                args: step.operation.args.map(value => cloneArgument(value)),
            };
            if (step.operation.disabled === true) config.disabled = true;
            if (step.operation.breakpoint === true) config.breakpoint = true;
            return config;
        });
    }


    /**
     * Returns Recipe structure without current argument values.
     *
     * @returns {Object} Immutable redacted Recipe projection.
     */
    getReadProjection() {
        const steps = this.#steps.map(step => Object.freeze({
            stepId: step.stepId,
            operationName: step.operation.op,
            disabled: step.operation.disabled === true,
            breakpoint: step.operation.breakpoint === true,
            argumentStates: Object.freeze(step.operation.args.map((value, index) => Object.freeze({
                index,
                configured: typeof value !== "undefined",
            }))),
        }));

        return Object.freeze({
            version: RECIPE_MODEL_VERSION,
            recipeRevision: this.#recipeRevision,
            steps: Object.freeze(steps),
        });
    }
}

export {
    MAX_STEP_ID_LENGTH,
    RECIPE_MODEL_VERSION,
    RecipeModel,
};
