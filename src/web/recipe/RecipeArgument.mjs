/**
 * Detaches the closed toggleString shape used by visible Recipe configuration.
 *
 * @param {*} value - Candidate toggleString argument.
 * @returns {Object|null} Immutable argument, or null when the shape is invalid.
 */
function copyToggleStringArgument(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;

    const descriptors = Object.getOwnPropertyDescriptors(value),
        keys = Reflect.ownKeys(descriptors);
    if (keys.length !== 2 || keys.some(key => typeof key !== "string" ||
        !["option", "string"].includes(key) || !descriptors[key].enumerable ||
        !("value" in descriptors[key])) || typeof descriptors.option?.value !== "string" ||
        typeof descriptors.string?.value !== "string") {
        return null;
    }
    return Object.freeze({
        option: descriptors.option.value,
        string: descriptors.string.value,
    });
}

export {copyToggleStringArgument};
