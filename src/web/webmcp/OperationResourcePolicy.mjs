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
            "maxExpansionRatio", "baseOutputBytes", "workFactor",
        ],
        keys = Reflect.ownKeys(descriptors);
    return (prototype === Object.prototype || prototype === null) &&
        keys.length === properties.length && keys.every(key => typeof key === "string" &&
            properties.includes(key) && descriptors[key].enumerable && "value" in descriptors[key]) &&
        ["linear", "superlinear"].includes(value.complexity) &&
        Number.isFinite(value.maxExpansionRatio) &&
        value.maxExpansionRatio >= 0 && Number.isSafeInteger(value.baseOutputBytes) &&
        value.baseOutputBytes >= 0 && Number.isSafeInteger(value.maxInputBytes) &&
        value.maxInputBytes >= 0 && value.maxInputBytes <= GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes &&
        Number.isSafeInteger(value.maxOutputBytes) && value.maxOutputBytes >= 0 &&
        value.maxOutputBytes <= GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes &&
        Number.isSafeInteger(value.workFactor) && value.workFactor >= 1 && value.workFactor <= 1024;
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
        workFactor: 1,
    });
}


/**
 * Defines a hard input cap and conservative work factor for a superlinear Operation.
 *
 * @param {number} maxExpansionRatio - Conservative output-to-input byte ratio.
 * @param {number} workFactor - Relative work multiplier applied to materialized bytes.
 * @param {number} maxInputBytes - Hard input cap established by review evidence.
 * @param {number} [baseOutputBytes=0] - Fixed output overhead.
 * @param {number} [maxOutputBytes] - Maximum materialized output bytes.
 * @returns {Object} Immutable resource limits.
 */
function boundedSuperlinearResourceLimits(
    maxExpansionRatio,
    workFactor,
    maxInputBytes,
    baseOutputBytes=0,
    maxOutputBytes=GOLDEN_RECIPE_RESOURCE_LIMITS.maxMaterializedBytes
) {
    const linear = linearResourceLimits(
        maxExpansionRatio,
        baseOutputBytes,
        maxInputBytes,
        maxOutputBytes
    );
    if (!Number.isSafeInteger(workFactor) || workFactor < 2 || workFactor > 1024) {
        throw new RangeError("Operation work factor is invalid");
    }
    return Object.freeze({
        ...linear,
        complexity: "superlinear",
        workFactor,
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


/**
 * Estimates cumulative work from the larger materialized side of one step.
 *
 * @param {Object} resourceLimits - Reviewed Operation resource limits.
 * @param {number} inputBytes - Estimated step input bytes.
 * @param {number} outputBytes - Estimated step output bytes.
 * @returns {number} Estimated work bytes or one byte above the global limit.
 */
function estimateOperationWorkBytes(resourceLimits, inputBytes, outputBytes) {
    const overflow = GOLDEN_RECIPE_RESOURCE_LIMITS.maxEstimatedWorkBytes + 1,
        estimate = Math.ceil(Math.max(inputBytes, outputBytes) * resourceLimits.workFactor);
    return Number.isSafeInteger(estimate) ? Math.min(estimate, overflow) : overflow;
}

export {
    GOLDEN_RECIPE_RESOURCE_LIMITS,
    boundedSuperlinearResourceLimits,
    estimateOperationOutputBytes,
    estimateOperationWorkBytes,
    isOperationResourceLimits,
    linearResourceLimits,
};
