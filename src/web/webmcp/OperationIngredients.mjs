import {sanitizeCatalogText} from "./CatalogText.mjs";

const INGREDIENT_DESCRIPTOR_VERSION = "2";
const INGREDIENT_NAME_MAX_CODE_POINTS = 128;
const INGREDIENT_DESCRIPTION_MAX_CODE_POINTS = 160;
const INGREDIENT_OPTION_TEXT_MAX_CODE_POINTS = 128;
const INGREDIENT_OPTION_DEFAULT_LIMIT = 20;
const INGREDIENT_OPTION_MAX_LIMIT = 50;

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

const UNSUPPORTED_INGREDIENT_REASON = Object.freeze({
    DISABLED: "DISABLED_INGREDIENT",
    UNKNOWN: "UNKNOWN_INGREDIENT_TYPE",
});


/**
 * Returns true for option group markers that are not selectable values.
 *
 * @param {*} value - Generated option value.
 * @returns {boolean} Whether the value is an option group marker.
 */
function isOptionGroup(value) {
    return typeof value === "string" && /^\[\/?[a-z0-9 \-()^]+\]$/iu.test(value);
}


/**
 * Describes selectable string options from generated configuration.
 *
 * @param {Object[]} options - Generated string option values.
 * @param {number} argumentIndex - Zero-based Operation argument position.
 * @returns {Object[]} Static option descriptors.
 */
function describeStringOptions(options, argumentIndex) {
    return (Array.isArray(options) ? options : []).flatMap((option, sourceOptionIndex) => {
        if (typeof option !== "string" || isOptionGroup(option)) return [];
        return [{
            argumentIndex,
            sourceOptionIndex,
            label: sanitizeCatalogText(option, INGREDIENT_OPTION_TEXT_MAX_CODE_POINTS),
            valueIncluded: true,
            value: option,
        }];
    });
}


/**
 * Describes named options whose Recipe value is either the name or configured string value.
 *
 * @param {Object[]} options - Generated named option records.
 * @param {number} argumentIndex - Zero-based Operation argument position.
 * @param {boolean} useConfiguredValue - Whether a string value overrides the record name.
 * @returns {Object[]} Static option descriptors.
 */
function describeNamedOptions(options, argumentIndex, useConfiguredValue) {
    return (Array.isArray(options) ? options : []).flatMap((option, sourceOptionIndex) => {
        if (typeof option === "string") {
            if (isOptionGroup(option)) return [];
            return [{
                argumentIndex,
                sourceOptionIndex,
                label: sanitizeCatalogText(option, INGREDIENT_OPTION_TEXT_MAX_CODE_POINTS),
                valueIncluded: true,
                value: option,
            }];
        }
        if (!option || typeof option.name !== "string" || isOptionGroup(option.name)) return [];
        const value = useConfiguredValue && typeof option.value === "string" ?
            option.value : option.name;
        return [{
            argumentIndex,
            sourceOptionIndex,
            label: sanitizeCatalogText(option.name, INGREDIENT_OPTION_TEXT_MAX_CODE_POINTS),
            valueIncluded: true,
            value,
        }];
    });
}


/**
 * Maps one generated Ingredient into the stable catalog descriptor format.
 *
 * @param {Object} ingredient - Generated Ingredient configuration.
 * @param {number} argumentIndex - Zero-based Operation argument position.
 * @param {*} defaultValue - Browser-equivalent default supplied by core argument resolution.
 * @returns {Object} Descriptor and static option items.
 */
function describeIngredient(ingredient, argumentIndex, defaultValue) {
    const sourceType = typeof ingredient?.type === "string" ? ingredient.type : "",
        allowEmpty = ingredient?.allowEmpty !== false,
        disabled = ingredient?.disabled === true;
    let valueType = "unsupported",
        supportedForPatch = true,
        unsupportedReason = null,
        constraints = {},
        optionItems = [];

    if (STRING_INGREDIENT_TYPES.has(sourceType)) {
        valueType = "string";
        const editable = sourceType === "editableOption" || sourceType === "editableOptionShort";
        if (editable) optionItems = describeNamedOptions(ingredient.value, argumentIndex, true);
        constraints = {
            allowEmpty,
            editable,
            sourceMaxCodeUnits: typeof ingredient.maxLength === "number" ? ingredient.maxLength : null,
        };
    } else if (sourceType === "boolean") {
        valueType = "boolean";
        constraints = {allowEmpty};
    } else if (sourceType === "number") {
        valueType = "number";
        constraints = {
            allowEmpty,
            finite: true,
            integer: ingredient.integer === true,
            minimum: typeof ingredient.min === "number" ? ingredient.min : null,
            maximum: typeof ingredient.max === "number" ? ingredient.max : null,
            step: typeof ingredient.step === "number" ? ingredient.step : null,
        };
    } else if (sourceType === "option") {
        valueType = "string";
        optionItems = describeStringOptions(ingredient.value, argumentIndex);
        constraints = {allowEmpty, exactOption: true};
    } else if (sourceType === "toggleString") {
        valueType = "toggleString";
        optionItems = describeStringOptions(ingredient.toggleValues, argumentIndex);
        constraints = {allowEmpty, exactOption: true};
    } else if (NAMED_OPTION_INGREDIENT_TYPES.has(sourceType)) {
        valueType = "string";
        optionItems = describeNamedOptions(ingredient.value, argumentIndex, false);
        constraints = {
            allowEmpty,
            exactOption: true,
            populatesArguments: sourceType !== "argSelector",
        };
    } else if (sourceType === "label") {
        valueType = "string";
        constraints = {allowEmpty: true, constant: ""};
    } else {
        supportedForPatch = false;
        unsupportedReason = UNSUPPORTED_INGREDIENT_REASON.UNKNOWN;
    }

    if (disabled) {
        supportedForPatch = false;
        unsupportedReason = UNSUPPORTED_INGREDIENT_REASON.DISABLED;
    }

    return {
        descriptor: Object.freeze({
            version: INGREDIENT_DESCRIPTOR_VERSION,
            argumentIndex,
            name: sanitizeCatalogText(ingredient?.name, INGREDIENT_NAME_MAX_CODE_POINTS),
            description: sanitizeCatalogText(ingredient?.hint, INGREDIENT_DESCRIPTION_MAX_CODE_POINTS),
            sourceType,
            valueType,
            defaultAvailable: typeof defaultValue !== "undefined",
            defaultValue: typeof defaultValue === "undefined" ? null : defaultValue,
            supportedForPatch,
            unsupportedReason,
            optionCount: optionItems.length,
            constraints: Object.freeze(constraints),
        }),
        optionItems,
    };
}


/**
 * Describes generated Operation Ingredients and paginates static option values.
 *
 * @param {Object[]} ingredients - Generated Ingredient configurations.
 * @param {number} [optionOffset=0] - Zero-based offset across all options.
 * @param {number} [optionLimit=20] - Maximum options in this page.
 * @param {Array|null} [defaultArguments=null] - Browser-equivalent defaults in argument order.
 * @returns {Object} Versioned Ingredient descriptors and option page.
 */
function describeOperationIngredients(
    ingredients,
    optionOffset=0,
    optionLimit=INGREDIENT_OPTION_DEFAULT_LIMIT,
    defaultArguments=null
) {
    if (!Array.isArray(ingredients)) throw new TypeError("Operation Ingredients must be an array");
    if (!Number.isInteger(optionOffset) || optionOffset < 0) {
        throw new RangeError("Ingredient option offset must be a non-negative integer");
    }
    if (!Number.isInteger(optionLimit) || optionLimit < 1 || optionLimit > INGREDIENT_OPTION_MAX_LIMIT) {
        throw new RangeError("Ingredient option limit is outside the supported range");
    }
    if (defaultArguments !== null && (!Array.isArray(defaultArguments) ||
        defaultArguments.length !== ingredients.length)) {
        throw new RangeError("Operation defaults do not match generated Ingredients");
    }

    const mapped = ingredients.map((ingredient, argumentIndex) => describeIngredient(
            ingredient,
            argumentIndex,
            defaultArguments === null ? undefined : defaultArguments[argumentIndex]
        )),
        descriptors = Object.freeze(mapped.map(item => item.descriptor)),
        allOptions = mapped.flatMap(item => item.optionItems),
        options = Object.freeze(allOptions.slice(optionOffset, optionOffset + optionLimit)
            .map(option => Object.freeze(option))),
        nextOptionOffset = optionOffset + options.length < allOptions.length ?
            optionOffset + options.length : null;

    return Object.freeze({
        version: INGREDIENT_DESCRIPTOR_VERSION,
        arguments: descriptors,
        options,
        optionTotal: allOptions.length,
        optionOffset,
        optionLimit,
        nextOptionOffset,
    });
}

export {
    INGREDIENT_DESCRIPTOR_VERSION,
    INGREDIENT_OPTION_DEFAULT_LIMIT,
    INGREDIENT_OPTION_MAX_LIMIT,
    UNSUPPORTED_INGREDIENT_REASON,
    describeOperationIngredients,
};
