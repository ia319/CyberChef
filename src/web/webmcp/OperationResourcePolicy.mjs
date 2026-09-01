const GOLDEN_RECIPE_RESOURCE_LIMITS = Object.freeze({
    maxActiveInputBytes: 256 * 1024,
    maxMaterializedBytes: 4 * 1024 * 1024,
    maxEstimatedWorkBytes: 16 * 1024 * 1024,
    maxSteps: 200,
});


/**
 * Checks the closed resource record accepted by Recipe preflight.
 *
 * @param {*} value - Candidate resource policy.
 * @returns {boolean} Whether the policy is bounded and declarative.
 */
function isOperationResourceLimits(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value),
        descriptors = Object.getOwnPropertyDescriptors(value),
        properties = [
            "complexity", "maxInputBytes", "maxOutputBytes",
            "maxExpansionRatio", "baseOutputBytes",
        ],
        keys = Reflect.ownKeys(descriptors);
    return (prototype === Object.prototype || prototype === null) &&
        keys.length === properties.length && keys.every(key => typeof key === "string" &&
            properties.includes(key) && descriptors[key].enumerable && "value" in descriptors[key]) &&
        value.complexity === "linear" && Number.isFinite(value.maxExpansionRatio) &&
        value.maxExpansionRatio >= 0 && Number.isSafeInteger(value.baseOutputBytes) &&
        value.baseOutputBytes >= 0 && Number.isSafeInteger(value.maxInputBytes) &&
        value.maxInputBytes >= 0 && value.maxInputBytes <= GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes &&
        Number.isSafeInteger(value.maxOutputBytes) && value.maxOutputBytes >= 0 &&
        value.maxOutputBytes <= GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes;
}


/**
 * Defines a bounded affine estimate for a linear Operation.
 *
 * @param {number} maxExpansionRatio - Conservative output-to-input byte ratio.
 * @param {number} [baseOutputBytes=0] - Fixed output overhead.
 * @param {number} [maxInputBytes] - Maximum accepted input bytes.
 * @param {number} [maxOutputBytes] - Maximum materialized output bytes.
 * @returns {Object} Immutable resource limits.
 */
function linearResourceLimits(
    maxExpansionRatio,
    baseOutputBytes=0,
    maxInputBytes=GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes,
    maxOutputBytes=GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes
) {
    if (!Number.isFinite(maxExpansionRatio) || maxExpansionRatio < 0 ||
        !Number.isSafeInteger(baseOutputBytes) || baseOutputBytes < 0 ||
        !Number.isSafeInteger(maxInputBytes) || maxInputBytes < 0 ||
        maxInputBytes > GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes ||
        !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 0 ||
        maxOutputBytes > GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes) {
        throw new RangeError("Operation resource limits are invalid");
    }
    return Object.freeze({
        complexity: "linear",
        maxInputBytes,
        maxOutputBytes,
        maxExpansionRatio,
        baseOutputBytes,
    });
}


/**
 * Estimates bounded output materialization without overflowing safe integers.
 *
 * @param {Object} resourceLimits - Reviewed Operation resource limits.
 * @param {number} inputBytes - Estimated input bytes for this step.
 * @returns {number} Estimated output bytes or one byte above the global limit.
 */
function estimateOperationOutputBytes(resourceLimits, inputBytes) {
    const overflow = GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes + 1,
        estimate = Math.ceil(resourceLimits.baseOutputBytes +
            inputBytes * resourceLimits.maxExpansionRatio);
    return Number.isSafeInteger(estimate) ? Math.min(estimate, overflow) : overflow;
}

export {
    GOLDEN_RECIPE_RESOURCE_LIMITS,
    estimateOperationOutputBytes,
    isOperationResourceLimits,
    linearResourceLimits,
};
