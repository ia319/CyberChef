import OperationConfig from "../../core/config/OperationConfig.json" with { type: "json" };
import Ingredient from "../../core/Ingredient.mjs";
import {
    isProfilePrimitive,
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
 * Applies CyberChef Ingredient validation before any Agent-only restriction.
 *
 * @param {string} operationName - Exact Operation name.
 * @param {Array} values - Complete primitive Operation arguments.
 * @returns {boolean} Whether core validation accepts every argument.
 */
function validateCoreOperationArguments(operationName, values) {
    const operation = Object.prototype.hasOwnProperty.call(OperationConfig, operationName) ?
            OperationConfig[operationName] : null,
        argumentsConfig = operation?.args;
    if (!Array.isArray(argumentsConfig) || argumentsConfig.length !== values.length ||
        values.some(value => !isProfilePrimitive(value))) {
        return false;
    }

    try {
        for (let index = 0; index < argumentsConfig.length; index++) {
            new Ingredient(argumentsConfig[index]).validate(values[index]);
        }
    } catch (err) {
        return false;
    }
    return true;
}


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
    if (!validateCoreOperationArguments(profile.operationName, values)) {
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
    validateCoreOperationArguments,
};
