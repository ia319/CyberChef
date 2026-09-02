import OperationConfig from "../../core/config/OperationConfig.json" with { type: "json" };
import Ingredient from "../../core/Ingredient.mjs";
import {copyToggleStringArgument} from "../recipe/RecipeArgument.mjs";

const OPERATION_ARGUMENT_ERROR_CODE = Object.freeze({
    UNKNOWN_OPERATION: "UNKNOWN_OPERATION",
    ARGUMENT_COUNT: "ARGUMENT_COUNT",
    ARGUMENT_VALUE: "ARGUMENT_VALUE",
    CORE_ARGUMENT_VALUE: "CORE_ARGUMENT_VALUE",
});

const STRING_INGREDIENT_TYPES = new Set([
    "binaryShortString",
    "binaryString",
    "byteArray",
    "editableOption",
    "editableOptionShort",
    "shortString",
    "string",
    "text",
]);

const NAMED_OPTION_INGREDIENT_TYPES = new Set([
    "argSelector",
    "populateOption",
    "populateMultiOption",
]);

const OPTION_GROUP_PATTERN = /^\[\/?[a-z0-9 \-()^]+\]$/iu;
const INVALID_VALUE = Object.freeze({valid: false});


/**
 * Returns selectable named records from generated Ingredient configuration.
 *
 * @param {*} value - Generated named option records.
 * @returns {Object[]} Selectable records in source order.
 */
function getNamedOptions(value) {
    return Array.isArray(value) ? value.filter(option =>
        option && typeof option === "object" && !Array.isArray(option) &&
        typeof option.name === "string" && !OPTION_GROUP_PATTERN.test(option.name)
    ) : [];
}


/**
 * Returns selectable strings from generated Ingredient configuration.
 *
 * @param {*} value - Generated option strings.
 * @returns {string[]} Selectable strings in source order.
 */
function getStringOptions(value) {
    return Array.isArray(value) ? value.filter(option =>
        typeof option === "string" && !OPTION_GROUP_PATTERN.test(option)
    ) : [];
}


/**
 * Resolves the browser-visible default for one generated Ingredient.
 *
 * @param {Object} config - Generated Ingredient configuration.
 * @returns {{valid: boolean, value?: *}} Default resolution result.
 */
function resolveIngredientDefault(config) {
    const defaultIndex = Number.isInteger(config?.defaultIndex) ? config.defaultIndex : 0;

    if (STRING_INGREDIENT_TYPES.has(config?.type)) {
        if (config.type === "editableOption" || config.type === "editableOptionShort") {
            const selected = Array.isArray(config.value) ? config.value[defaultIndex] : null;
            if (typeof selected === "string") return {valid: true, value: selected};
            return selected && typeof selected.value === "string" ?
                {valid: true, value: selected.value} : INVALID_VALUE;
        }
        return typeof config.value === "string" ? {valid: true, value: config.value} : INVALID_VALUE;
    }
    if (config?.type === "boolean") {
        return {valid: true, value: Boolean(config.value)};
    }
    if (config?.type === "number") {
        const number = typeof config.value === "number" ? config.value :
            typeof config.value === "string" ? Number.parseFloat(config.value) : Number.NaN;
        return Number.isFinite(number) ? {valid: true, value: number} : INVALID_VALUE;
    }
    if (config?.type === "option") {
        const sourceDefault = Array.isArray(config.value) ? config.value[defaultIndex] : null,
            selected = typeof sourceDefault === "string" && !OPTION_GROUP_PATTERN.test(sourceDefault) ?
                sourceDefault : getStringOptions(config.value)[0];
        return typeof selected === "string" ? {valid: true, value: selected} : INVALID_VALUE;
    }
    if (config?.type === "toggleString") {
        const option = Array.isArray(config.toggleValues) ? config.toggleValues[0] : null;
        return typeof option === "string" && typeof config.value === "string" ? {
            valid: true,
            value: Object.freeze({option, string: config.value}),
        } : INVALID_VALUE;
    }
    if (config?.type === "argSelector") {
        const sourceDefault = Array.isArray(config.value) ? config.value[defaultIndex] : null,
            selected = sourceDefault && typeof sourceDefault.name === "string" &&
                !OPTION_GROUP_PATTERN.test(sourceDefault.name) ? sourceDefault : getNamedOptions(config.value)[0];
        return selected ? {valid: true, value: selected.name} : INVALID_VALUE;
    }
    if (config?.type === "populateOption" || config?.type === "populateMultiOption") {
        const selected = getNamedOptions(config.value)[0];
        return selected ? {valid: true, value: selected.name} : INVALID_VALUE;
    }
    if (config?.type === "label") return {valid: true, value: ""};
    return INVALID_VALUE;
}


/**
 * Normalizes one JSON Recipe argument to the value shape produced by the browser UI.
 *
 * @param {Object} config - Generated Ingredient configuration.
 * @param {*} value - Candidate Recipe argument.
 * @returns {{valid: boolean, value?: *}} Normalization result.
 */
function normalizeIngredientValue(config, value) {
    if (STRING_INGREDIENT_TYPES.has(config.type)) {
        return typeof value === "string" ? {valid: true, value} : INVALID_VALUE;
    }
    if (config.type === "boolean") {
        return typeof value === "boolean" ? {valid: true, value} : INVALID_VALUE;
    }
    if (config.type === "number") {
        return typeof value === "number" && Number.isFinite(value) ?
            {valid: true, value} : INVALID_VALUE;
    }
    if (config.type === "option") {
        return typeof value === "string" && getStringOptions(config.value).includes(value) ?
            {valid: true, value} : INVALID_VALUE;
    }
    if (config.type === "toggleString") {
        const argument = copyToggleStringArgument(value);
        return argument && Array.isArray(config.toggleValues) &&
            config.toggleValues.includes(argument.option) ? {
                valid: true,
                value: argument,
            } : INVALID_VALUE;
    }
    if (NAMED_OPTION_INGREDIENT_TYPES.has(config.type)) {
        return typeof value === "string" && getNamedOptions(config.value)
            .some(option => option.name === value) ? {valid: true, value} : INVALID_VALUE;
    }
    if (config.type === "label") {
        return value === "" ? {valid: true, value: ""} : INVALID_VALUE;
    }
    return INVALID_VALUE;
}


/**
 * Applies the same preset population that occurs when the browser inserts an Operation.
 *
 * @param {Object[]} configs - Generated Ingredient configurations.
 * @param {Array} values - Candidate browser Recipe values.
 * @returns {boolean} Whether every selected preset is valid.
 */
function applyPopulateSelections(configs, values) {
    for (let index = 0; index < configs.length; index++) {
        const config = configs[index];
        if (config.type !== "populateOption" && config.type !== "populateMultiOption") continue;

        const selected = getNamedOptions(config.value).find(option => option.name === values[index]);
        if (!selected) return false;

        if (config.type === "populateOption") {
            if (!Number.isInteger(config.target) || config.target < 0 || config.target >= configs.length) {
                return false;
            }
            if (values[config.target] === "" && selected.value !== "") {
                values[config.target] = String(selected.value);
            }
            continue;
        }

        if (!Array.isArray(config.target) || !Array.isArray(selected.value) ||
            config.target.length !== selected.value.length) return false;
        for (let targetIndex = 0; targetIndex < config.target.length; targetIndex++) {
            const target = config.target[targetIndex];
            if (!Number.isInteger(target) || target < 0 || target >= configs.length) return false;
            values[target] = String(selected.value[targetIndex]);
        }
    }
    return true;
}


/**
 * Resolves and validates complete browser Recipe arguments from CyberChef metadata.
 *
 * @param {string} operationName - Exact Operation name.
 * @param {Array|undefined} argumentsValue - Requested arguments or undefined for UI defaults.
 * @returns {Object} Fixed validation result and detached Recipe arguments.
 */
function resolveOperationArguments(operationName, argumentsValue) {
    const operation = Object.prototype.hasOwnProperty.call(OperationConfig, operationName) ?
            OperationConfig[operationName] : null,
        configs = operation?.args;
    if (!Array.isArray(configs)) {
        return Object.freeze({valid: false, code: OPERATION_ARGUMENT_ERROR_CODE.UNKNOWN_OPERATION});
    }

    let values;
    if (typeof argumentsValue === "undefined") {
        values = [];
        for (const config of configs) {
            const resolved = resolveIngredientDefault(config);
            if (!resolved.valid) {
                return Object.freeze({valid: false, code: OPERATION_ARGUMENT_ERROR_CODE.ARGUMENT_VALUE});
            }
            values.push(resolved.value);
        }
    } else if (Array.isArray(argumentsValue) && argumentsValue.length === configs.length) {
        values = [...argumentsValue];
    } else {
        return Object.freeze({valid: false, code: OPERATION_ARGUMENT_ERROR_CODE.ARGUMENT_COUNT});
    }

    if (!applyPopulateSelections(configs, values)) {
        return Object.freeze({valid: false, code: OPERATION_ARGUMENT_ERROR_CODE.ARGUMENT_VALUE});
    }

    const normalized = [];
    try {
        for (let index = 0; index < configs.length; index++) {
            const result = normalizeIngredientValue(configs[index], values[index]);
            if (!result.valid) {
                return Object.freeze({valid: false, code: OPERATION_ARGUMENT_ERROR_CODE.ARGUMENT_VALUE});
            }
            const ingredient = new Ingredient(configs[index]);
            ingredient.value = result.value;
            ingredient.validate(ingredient.value);
            normalized.push(result.value);
        }
    } catch (err) {
        return Object.freeze({valid: false, code: OPERATION_ARGUMENT_ERROR_CODE.CORE_ARGUMENT_VALUE});
    }

    return Object.freeze({
        valid: true,
        arguments: Object.freeze(normalized),
    });
}

export {
    OPERATION_ARGUMENT_ERROR_CODE,
    resolveOperationArguments,
};
