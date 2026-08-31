const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);


/**
 * Verifies that a value can be copied without invoking application code or losing data.
 *
 * @param {*} value - Candidate JSON value.
 * @param {number} depth - Current traversal depth.
 * @param {Object} budget - Shared node budget and limits.
 * @param {WeakSet<Object>} ancestors - Objects in the current traversal path.
 */
function assertJsonValue(value, depth, budget, ancestors) {
    if (depth > budget.maxDepth) throw new RangeError("JSON value is too deep");
    budget.nodes++;
    if (budget.nodes > budget.maxNodes) throw new RangeError("JSON value has too many nodes");

    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") {
        if (!Number.isFinite(value) || Object.is(value, -0)) {
            throw new TypeError("JSON value contains a lossy number");
        }
        return;
    }
    if (typeof value !== "object") throw new TypeError("Unsupported JSON value");
    if (ancestors.has(value)) throw new TypeError("JSON value is cyclic");

    ancestors.add(value);

    if (Array.isArray(value)) {
        if (Reflect.ownKeys(value).length !== value.length + 1 || Object.keys(value).length !== value.length) {
            throw new TypeError("JSON value contains a sparse or extended array");
        }
        for (const item of value) assertJsonValue(item, depth + 1, budget, ancestors);
        ancestors.delete(value);
        return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError("JSON value contains a class instance");
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key];
        if (typeof key !== "string" || FORBIDDEN_OBJECT_KEYS.has(key) ||
            !descriptor.enumerable || !("value" in descriptor)) {
            throw new TypeError("JSON value contains an unsupported property");
        }
        assertJsonValue(descriptor.value, depth + 1, budget, ancestors);
    }

    ancestors.delete(value);
}


/**
 * Creates a detached JSON value under explicit structural limits.
 *
 * @param {*} value - Candidate JSON value.
 * @param {number} maxDepth - Maximum nested object and array depth.
 * @param {number} maxNodes - Maximum values in the structure.
 * @returns {{serialized: string, value: *}} Serialized and detached values.
 */
function copyJsonValue(value, maxDepth, maxNodes) {
    assertJsonValue(value, 0, {nodes: 0, maxDepth, maxNodes}, new WeakSet());
    const serialized = JSON.stringify(value);

    if (typeof serialized !== "string") throw new TypeError("Value is not JSON serializable");

    return {
        serialized,
        value: JSON.parse(serialized),
    };
}

export {
    copyJsonValue,
};
