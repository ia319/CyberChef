import {resolveOperationArguments} from "./OperationArguments.mjs";
import {
    matchesOperationProfileRelations,
    matchesOperationProfileRule,
} from "./OperationProfileRules.mjs";

const PROFILE_VALIDATION_CODE = Object.freeze({
    ARGUMENT_COUNT: "ARGUMENT_COUNT",
    ARGUMENT_VALUE: "ARGUMENT_VALUE",
    CORE_ARGUMENT_VALUE: "CORE_ARGUMENT_VALUE",
    ARGUMENT_RELATION: "ARGUMENT_RELATION",
});


/**
 * Validates or supplies the exact arguments accepted by one reviewed profile.
 *
 * @param {Object} profile - Reviewed Operation profile.
 * @param {Array|undefined} argumentsValue - Requested arguments or undefined for defaults.
 * @returns {Object} Fixed validation result and normalized arguments.
 */
function resolveOperationProfileArguments(profile, argumentsValue) {
    const values = typeof argumentsValue === "undefined" ? profile.defaultArguments : argumentsValue;
    if (!Array.isArray(values) || values.length !== profile.argumentRules.length) {
        return Object.freeze({valid: false, code: PROFILE_VALIDATION_CODE.ARGUMENT_COUNT});
    }
    if (!resolveOperationArguments(profile.operationName, values).valid) {
        return Object.freeze({valid: false, code: PROFILE_VALIDATION_CODE.CORE_ARGUMENT_VALUE});
    }

    for (let index = 0; index < profile.argumentRules.length; index++) {
        if (!matchesOperationProfileRule(profile.argumentRules[index], values[index], values)) {
            return Object.freeze({valid: false, code: PROFILE_VALIDATION_CODE.ARGUMENT_VALUE});
        }
    }
    if (!matchesOperationProfileRelations(profile.argumentRelations, values, profile.argumentRules)) {
        return Object.freeze({valid: false, code: PROFILE_VALIDATION_CODE.ARGUMENT_RELATION});
    }

    return Object.freeze({
        valid: true,
        arguments: Object.freeze([...values]),
    });
}

export {
    PROFILE_VALIDATION_CODE,
    resolveOperationProfileArguments,
};
