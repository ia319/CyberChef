import { sanitizeCatalogText } from "./CatalogText.mjs";
import { PROFILE_ARGUMENT_RULE } from "./OperationProfiles.mjs";

const INGREDIENT_DESCRIPTOR_VERSION = "1";
const INGREDIENT_NAME_MAX_CODE_POINTS = 128;
const INGREDIENT_DESCRIPTION_MAX_CODE_POINTS = 160;
const INGREDIENT_OPTION_TEXT_MAX_CODE_POINTS = 128;
const INGREDIENT_DEFAULT_MAX_CODE_POINTS = 256;
const INGREDIENT_OPTION_VALUE_MAX_CODE_POINTS = 256;
const INGREDIENT_STRING_MAX_CODE_POINTS = 16 * 1024;
const INGREDIENT_OPTION_DEFAULT_LIMIT = 20;
const INGREDIENT_OPTION_MAX_LIMIT = 50;

const STRING_INGREDIENT_TYPES = new Set([
    "binaryShortString",
    "binaryString",
    "shortString",
    "string",
    "text",
]);

const UNSUPPORTED_INGREDIENT_REASON = Object.freeze({
    ARGUMENT_SELECTOR: "ARGUMENT_SELECTOR",
    DISABLED: "DISABLED_INGREDIENT",
    EDITABLE_OPTION: "EDITABLE_OPTION_REQUIRES_PROFILE",
    LABEL: "NON_VALUE_INGREDIENT",
    POPULATES_ARGUMENTS: "POPULATES_OTHER_ARGUMENTS",
    TOGGLE_STRING: "COMPOSITE_VALUE",
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
 * Describes selectable string options while bounding exact returned values.
 *
 * @param {Object[]} options - Generated string option values.
 * @param {number} argumentIndex - Zero-based Operation argument position.
 * @returns {Object[]} Static option descriptors.
 */
function describeStringOptions(options, argumentIndex) {
    return (Array.isArray(options) ? options : []).flatMap((option, sourceOptionIndex) => {
        if (typeof option !== "string" || isOptionGroup(option)) return [];
        const valueIncluded = [...option].length <= INGREDIENT_OPTION_VALUE_MAX_CODE_POINTS;
        return [{
            argumentIndex,
            sourceOptionIndex,
            label: sanitizeCatalogText(option, INGREDIENT_OPTION_TEXT_MAX_CODE_POINTS),
            valueIncluded,
            value: valueIncluded ? option : null,
        }];
    });
}


/**
 * Describes dynamic option labels without exposing values that change other arguments.
 *
 * @param {Object[]} options - Generated named option records.
 * @param {number} argumentIndex - Zero-based Operation argument position.
 * @returns {Object[]} Static label-only option descriptors.
 */
function describeNamedOptions(options, argumentIndex) {
    return (Array.isArray(options) ? options : []).flatMap((option, sourceOptionIndex) => {
        if (!option || typeof option.name !== "string" || isOptionGroup(option.name)) return [];
        return [{
            argumentIndex,
            sourceOptionIndex,
            label: sanitizeCatalogText(option.name, INGREDIENT_OPTION_TEXT_MAX_CODE_POINTS),
            valueIncluded: false,
            value: null,
        }];
    });
}


/**
 * Maps one generated Ingredient into the stable catalog descriptor format.
 *
 * @param {Object} ingredient - Generated Ingredient configuration.
 * @param {number} argumentIndex - Zero-based Operation argument position.
 * @returns {Object} Descriptor and static option items.
 */
function describeIngredient(ingredient, argumentIndex) {
    const sourceType = typeof ingredient?.type === "string" ? ingredient.type : "",
        allowEmpty = ingredient?.allowEmpty !== false,
        disabled = ingredient?.disabled === true;
    let valueType = "unsupported",
        defaultValue = null,
        defaultAvailable = false,
        supportedForPatch = false,
        unsupportedReason = UNSUPPORTED_INGREDIENT_REASON.UNKNOWN,
        constraints = {},
        optionItems = [];

    if (STRING_INGREDIENT_TYPES.has(sourceType)) {
        const sourceDefault = typeof ingredient.value === "string" ? ingredient.value : "";
        valueType = "string";
        defaultAvailable = [...sourceDefault].length <= INGREDIENT_DEFAULT_MAX_CODE_POINTS;
        defaultValue = defaultAvailable ? sourceDefault : null;
        supportedForPatch = true;
        unsupportedReason = null;
        constraints = {
            allowEmpty,
            maxCodePoints: INGREDIENT_STRING_MAX_CODE_POINTS,
            sourceMaxCodeUnits: typeof ingredient.maxLength === "number" ? ingredient.maxLength : null,
        };
    } else if (sourceType === "boolean") {
        valueType = "boolean";
        defaultAvailable = typeof ingredient.value === "boolean";
        defaultValue = defaultAvailable ? ingredient.value : null;
        supportedForPatch = true;
        unsupportedReason = null;
        constraints = {allowEmpty};
    } else if (sourceType === "number") {
        valueType = "number";
        defaultValue = typeof ingredient.value === "number" && Number.isFinite(ingredient.value) ? ingredient.value : null;
        defaultAvailable = defaultValue !== null;
        supportedForPatch = true;
        unsupportedReason = null;
        constraints = {
            allowEmpty,
            finite: true,
            integer: ingredient.integer === true,
            minimum: typeof ingredient.min === "number" ? ingredient.min : null,
            maximum: typeof ingredient.max === "number" ? ingredient.max : null,
            step: typeof ingredient.step === "number" ? ingredient.step : null,
        };
    } else if (sourceType === "option") {
        const options = Array.isArray(ingredient.value) ? ingredient.value : [],
            defaultIndex = Number.isInteger(ingredient.defaultIndex) ? ingredient.defaultIndex : 0,
            selected = options[defaultIndex];

        valueType = "string";
        defaultAvailable = typeof selected === "string" && !isOptionGroup(selected) &&
            [...selected].length <= INGREDIENT_DEFAULT_MAX_CODE_POINTS;
        defaultValue = defaultAvailable ? selected : null;
        supportedForPatch = true;
        unsupportedReason = null;
        optionItems = describeStringOptions(options, argumentIndex);
        constraints = {
            allowEmpty,
            exactOption: true,
        };
    } else if (sourceType === "editableOption" || sourceType === "editableOptionShort") {
        valueType = "string";
        unsupportedReason = UNSUPPORTED_INGREDIENT_REASON.EDITABLE_OPTION;
        optionItems = describeNamedOptions(ingredient.value, argumentIndex);
        constraints = {allowEmpty};
    } else if (sourceType === "toggleString") {
        unsupportedReason = UNSUPPORTED_INGREDIENT_REASON.TOGGLE_STRING;
        optionItems = describeStringOptions(ingredient.toggleValues, argumentIndex);
        constraints = {allowEmpty};
    } else if (sourceType === "argSelector") {
        unsupportedReason = UNSUPPORTED_INGREDIENT_REASON.ARGUMENT_SELECTOR;
        optionItems = describeNamedOptions(ingredient.value, argumentIndex);
        constraints = {allowEmpty};
    } else if (sourceType === "populateOption" || sourceType === "populateMultiOption") {
        unsupportedReason = UNSUPPORTED_INGREDIENT_REASON.POPULATES_ARGUMENTS;
        optionItems = describeNamedOptions(ingredient.value, argumentIndex);
        constraints = {allowEmpty};
    } else if (sourceType === "label") {
        unsupportedReason = UNSUPPORTED_INGREDIENT_REASON.LABEL;
        constraints = {allowEmpty};
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
            defaultAvailable,
            defaultValue,
            supportedForPatch,
            unsupportedReason,
            optionCount: optionItems.length,
            constraints: Object.freeze(constraints),
        }),
        optionItems,
    };
}


/**
 * Applies an audited argument rule to one conservative Ingredient descriptor.
 *
 * @param {Object} mappedIngredient - Base descriptor and option items.
 * @param {Object} rule - Audited argument rule.
 * @param {string|number|boolean} defaultValue - Audited default value.
 * @returns {Object} Profile-backed descriptor and options.
 */
function applyIngredientProfile(mappedIngredient, rule, defaultValue) {
    let valueType,
        constraints,
        optionItems = [];

    if (rule.type === PROFILE_ARGUMENT_RULE.BOOLEAN) {
        valueType = "boolean";
        constraints = {
            allowEmpty: false,
            profileRule: PROFILE_ARGUMENT_RULE.BOOLEAN,
        };
    } else if (rule.type === PROFILE_ARGUMENT_RULE.CONSTANT) {
        valueType = typeof rule.value;
        constraints = {
            allowEmpty: false,
            profileRule: PROFILE_ARGUMENT_RULE.CONSTANT,
            constant: rule.value,
        };
    } else if (rule.type === PROFILE_ARGUMENT_RULE.ENUM) {
        valueType = "string";
        constraints = {
            allowEmpty: false,
            profileRule: PROFILE_ARGUMENT_RULE.ENUM,
            exactOption: true,
        };
        optionItems = rule.values.map((value, sourceOptionIndex) => Object.freeze({
            argumentIndex: mappedIngredient.descriptor.argumentIndex,
            sourceOptionIndex,
            label: sanitizeCatalogText(value, INGREDIENT_OPTION_TEXT_MAX_CODE_POINTS),
            valueIncluded: true,
            value,
        }));
    } else {
        throw new TypeError("Operation profile contains an unknown argument rule");
    }

    return {
        descriptor: Object.freeze({
            ...mappedIngredient.descriptor,
            valueType,
            defaultAvailable: true,
            defaultValue,
            supportedForPatch: true,
            unsupportedReason: null,
            optionCount: optionItems.length,
            constraints: Object.freeze(constraints),
        }),
        optionItems,
    };
}


/**
 * Describes generated Operation Ingredients and paginates static option labels.
 *
 * @param {Object[]} ingredients - Generated Ingredient configurations.
 * @param {number} [optionOffset=0] - Zero-based offset across all options.
 * @param {number} [optionLimit=20] - Maximum options in this page.
 * @param {Object|null} [profile=null] - Audited Operation profile.
 * @returns {Object} Versioned Ingredient descriptors and option page.
 */
function describeOperationIngredients(
    ingredients,
    optionOffset=0,
    optionLimit=INGREDIENT_OPTION_DEFAULT_LIMIT,
    profile=null
) {
    if (!Array.isArray(ingredients)) throw new TypeError("Operation Ingredients must be an array");
    if (!Number.isInteger(optionOffset) || optionOffset < 0) {
        throw new RangeError("Ingredient option offset must be a non-negative integer");
    }
    if (!Number.isInteger(optionLimit) || optionLimit < 1 || optionLimit > INGREDIENT_OPTION_MAX_LIMIT) {
        throw new RangeError("Ingredient option limit is outside the supported range");
    }
    if (profile && (profile.argumentRules.length !== ingredients.length ||
        profile.defaultArguments.length !== ingredients.length)) {
        throw new RangeError("Operation profile does not match generated Ingredients");
    }

    const mapped = ingredients.map((ingredient, argumentIndex) => {
            const described = describeIngredient(ingredient, argumentIndex);
            return profile ? applyIngredientProfile(
                described,
                profile.argumentRules[argumentIndex],
                profile.defaultArguments[argumentIndex]
            ) : described;
        }),
        descriptors = Object.freeze(mapped.map(item => item.descriptor)),
        allOptions = mapped.flatMap(item => item.optionItems),
        options = Object.freeze(allOptions.slice(optionOffset, optionOffset + optionLimit).map(option => Object.freeze(option))),
        nextOptionOffset = optionOffset + options.length < allOptions.length ? optionOffset + options.length : null;

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
    INGREDIENT_STRING_MAX_CODE_POINTS,
    UNSUPPORTED_INGREDIENT_REASON,
    describeOperationIngredients,
};
