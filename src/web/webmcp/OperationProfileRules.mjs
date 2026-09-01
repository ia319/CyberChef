import Utils from "../../core/Utils.mjs";

const PROFILE_ARGUMENT_RULE = Object.freeze({
    ALPHABET: "alphabet",
    BOOLEAN: "boolean",
    CONDITIONAL: "conditional",
    CONSTANT: "constant",
    ENUM: "enum",
    INTEGER: "integer",
    STRING: "string",
});

const PROFILE_RELATION_RULE = Object.freeze({
    NOT_IN_ALPHABET: "notInAlphabet",
});

const JSON_PRIMITIVE_TYPES = new Set(["boolean", "number", "string"]);
const RULE_TYPES = new Set(Object.values(PROFILE_ARGUMENT_RULE));
const RELATION_TYPES = new Set(Object.values(PROFILE_RELATION_RULE));
const MAX_RULE_DEPTH = 3;


/**
 * Checks a plain record with exactly the expected data properties.
 *
 * @param {*} value - Candidate record.
 * @param {string[]} properties - Exact property names.
 * @returns {boolean} Whether the record has the expected shape.
 */
function hasExactDataProperties(value, properties) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value),
        descriptors = Object.getOwnPropertyDescriptors(value),
        keys = Reflect.ownKeys(descriptors);
    return (prototype === Object.prototype || prototype === null) &&
        keys.length === properties.length &&
        keys.every(key => typeof key === "string" && properties.includes(key) &&
            descriptors[key].enumerable && "value" in descriptors[key]);
}


/**
 * Checks a JSON-safe primitive used by a declarative rule.
 *
 * @param {*} value - Candidate value.
 * @returns {boolean} Whether the value is supported.
 */
function isProfilePrimitive(value) {
    return JSON_PRIMITIVE_TYPES.has(typeof value) &&
        (typeof value !== "number" || Number.isFinite(value));
}


/**
 * Defines an exact string allowlist for one Operation argument.
 *
 * @param {Array} values - Accepted primitive values.
 * @returns {Object} Immutable argument rule.
 */
function enumRule(values) {
    if (!Array.isArray(values) || values.length < 1 ||
        values.some(value => !isProfilePrimitive(value)) ||
        new Set(values).size !== values.length) {
        throw new TypeError("Profile enum values must be unique JSON primitives");
    }
    return Object.freeze({
        type: PROFILE_ARGUMENT_RULE.ENUM,
        values: Object.freeze([...values]),
    });
}


/**
 * Defines a boolean Operation argument.
 *
 * @returns {Object} Immutable argument rule.
 */
function booleanRule() {
    return Object.freeze({type: PROFILE_ARGUMENT_RULE.BOOLEAN});
}


/**
 * Defines one exact primitive Operation argument value.
 *
 * @param {string|number|boolean} value - Required argument value.
 * @returns {Object} Immutable argument rule.
 */
function constantRule(value) {
    if (!isProfilePrimitive(value)) {
        throw new TypeError("Profile constants must be JSON primitives");
    }
    return Object.freeze({
        type: PROFILE_ARGUMENT_RULE.CONSTANT,
        value,
    });
}


/**
 * Defines a bounded integer Operation argument.
 *
 * @param {number} minimum - Inclusive lower bound.
 * @param {number} maximum - Inclusive upper bound.
 * @returns {Object} Immutable argument rule.
 */
function integerRule(minimum, maximum) {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum > maximum) {
        throw new RangeError("Profile integer bounds must be ordered safe integers");
    }
    return Object.freeze({
        type: PROFILE_ARGUMENT_RULE.INTEGER,
        minimum,
        maximum,
    });
}


/**
 * Defines a bounded string with an optional code point range.
 *
 * @param {number} minimumCodePoints - Inclusive string length lower bound.
 * @param {number} maximumCodePoints - Inclusive string length upper bound.
 * @param {number} [minimumCharacterCodePoint=0] - Inclusive character lower bound.
 * @param {number} [maximumCharacterCodePoint=0x10ffff] - Inclusive character upper bound.
 * @returns {Object} Immutable argument rule.
 */
function stringRule(
    minimumCodePoints,
    maximumCodePoints,
    minimumCharacterCodePoint=0,
    maximumCharacterCodePoint=0x10ffff
) {
    if (!Number.isSafeInteger(minimumCodePoints) || !Number.isSafeInteger(maximumCodePoints) ||
        minimumCodePoints < 0 || minimumCodePoints > maximumCodePoints ||
        !Number.isSafeInteger(minimumCharacterCodePoint) ||
        !Number.isSafeInteger(maximumCharacterCodePoint) ||
        minimumCharacterCodePoint < 0 || maximumCharacterCodePoint > 0x10ffff ||
        minimumCharacterCodePoint > maximumCharacterCodePoint) {
        throw new RangeError("Profile string bounds are invalid");
    }
    return Object.freeze({
        type: PROFILE_ARGUMENT_RULE.STRING,
        minimumCodePoints,
        maximumCodePoints,
        minimumCharacterCodePoint,
        maximumCharacterCodePoint,
    });
}


/**
 * Defines an ASCII alphabet expression with an exact expanded symbol count.
 *
 * @param {number} symbolCount - Required number of unique expanded symbols.
 * @param {string[]} [presets=[]] - Audited suggested expressions.
 * @param {number} [maximumExpressionCodePoints=256] - Maximum compact expression length.
 * @returns {Object} Immutable argument rule.
 */
function alphabetRule(symbolCount, presets=[], maximumExpressionCodePoints=256) {
    if (!Number.isSafeInteger(symbolCount) || symbolCount < 1 || symbolCount > 256 ||
        !Number.isSafeInteger(maximumExpressionCodePoints) || maximumExpressionCodePoints < 1 ||
        maximumExpressionCodePoints > 256 || !Array.isArray(presets) ||
        presets.some(value => typeof value !== "string") || new Set(presets).size !== presets.length) {
        throw new RangeError("Profile alphabet constraints are invalid");
    }
    return Object.freeze({
        type: PROFILE_ARGUMENT_RULE.ALPHABET,
        symbolCount,
        maximumExpressionCodePoints,
        presets: Object.freeze([...presets]),
    });
}


/**
 * Selects one of two finite rules from another argument value.
 *
 * @param {number} argumentIndex - Dependency argument position.
 * @param {string|number|boolean} value - Dependency value selecting the matched rule.
 * @param {Object} matchedRule - Rule used when the dependency matches.
 * @param {Object} unmatchedRule - Rule used otherwise.
 * @returns {Object} Immutable conditional rule.
 */
function conditionalRule(argumentIndex, value, matchedRule, unmatchedRule) {
    if (!Number.isSafeInteger(argumentIndex) || argumentIndex < 0 || !isProfilePrimitive(value) ||
        !isOperationProfileRule(matchedRule) || !isOperationProfileRule(unmatchedRule)) {
        throw new TypeError("Profile conditional rule is invalid");
    }
    return Object.freeze({
        type: PROFILE_ARGUMENT_RULE.CONDITIONAL,
        argumentIndex,
        value,
        matchedRule,
        unmatchedRule,
    });
}


/**
 * Prevents one string argument from overlapping an expanded alphabet argument.
 *
 * @param {number} valueArgumentIndex - String argument position.
 * @param {number} alphabetArgumentIndex - Alphabet expression argument position.
 * @returns {Object} Immutable relation rule.
 */
function notInAlphabetRelation(valueArgumentIndex, alphabetArgumentIndex) {
    if (!Number.isSafeInteger(valueArgumentIndex) || valueArgumentIndex < 0 ||
        !Number.isSafeInteger(alphabetArgumentIndex) || alphabetArgumentIndex < 0 ||
        valueArgumentIndex === alphabetArgumentIndex) {
        throw new RangeError("Profile relation indexes are invalid");
    }
    return Object.freeze({
        type: PROFILE_RELATION_RULE.NOT_IN_ALPHABET,
        valueArgumentIndex,
        alphabetArgumentIndex,
    });
}


/**
 * Validates one declarative argument rule without executing profile code.
 *
 * @param {*} rule - Candidate rule.
 * @param {number} [depth=0] - Nested conditional depth.
 * @returns {boolean} Whether the rule has a supported closed shape.
 */
function isOperationProfileRule(rule, depth=0) {
    if (depth > MAX_RULE_DEPTH || !rule || !RULE_TYPES.has(rule.type)) return false;

    if (rule.type === PROFILE_ARGUMENT_RULE.BOOLEAN) {
        return hasExactDataProperties(rule, ["type"]);
    }
    if (rule.type === PROFILE_ARGUMENT_RULE.CONSTANT) {
        return hasExactDataProperties(rule, ["type", "value"]) && isProfilePrimitive(rule.value);
    }
    if (rule.type === PROFILE_ARGUMENT_RULE.ENUM) {
        return hasExactDataProperties(rule, ["type", "values"]) && Array.isArray(rule.values) &&
            rule.values.length > 0 && rule.values.every(isProfilePrimitive) &&
            new Set(rule.values).size === rule.values.length;
    }
    if (rule.type === PROFILE_ARGUMENT_RULE.INTEGER) {
        return hasExactDataProperties(rule, ["type", "minimum", "maximum"]) &&
            Number.isSafeInteger(rule.minimum) && Number.isSafeInteger(rule.maximum) &&
            rule.minimum <= rule.maximum;
    }
    if (rule.type === PROFILE_ARGUMENT_RULE.STRING) {
        return hasExactDataProperties(rule, [
            "type", "minimumCodePoints", "maximumCodePoints",
            "minimumCharacterCodePoint", "maximumCharacterCodePoint",
        ]) && Number.isSafeInteger(rule.minimumCodePoints) &&
            Number.isSafeInteger(rule.maximumCodePoints) && rule.minimumCodePoints >= 0 &&
            rule.minimumCodePoints <= rule.maximumCodePoints &&
            Number.isSafeInteger(rule.minimumCharacterCodePoint) &&
            Number.isSafeInteger(rule.maximumCharacterCodePoint) &&
            rule.minimumCharacterCodePoint >= 0 && rule.maximumCharacterCodePoint <= 0x10ffff &&
            rule.minimumCharacterCodePoint <= rule.maximumCharacterCodePoint;
    }
    if (rule.type === PROFILE_ARGUMENT_RULE.ALPHABET) {
        return hasExactDataProperties(rule, [
            "type", "symbolCount", "maximumExpressionCodePoints", "presets",
        ]) && Number.isSafeInteger(rule.symbolCount) && rule.symbolCount > 0 &&
            rule.symbolCount <= 256 && Number.isSafeInteger(rule.maximumExpressionCodePoints) &&
            rule.maximumExpressionCodePoints > 0 && rule.maximumExpressionCodePoints <= 256 &&
            Array.isArray(rule.presets) && rule.presets.every(value => typeof value === "string") &&
            new Set(rule.presets).size === rule.presets.length;
    }
    return hasExactDataProperties(rule, [
        "type", "argumentIndex", "value", "matchedRule", "unmatchedRule",
    ]) && Number.isSafeInteger(rule.argumentIndex) && rule.argumentIndex >= 0 &&
        isProfilePrimitive(rule.value) && isOperationProfileRule(rule.matchedRule, depth + 1) &&
        isOperationProfileRule(rule.unmatchedRule, depth + 1);
}


/**
 * Validates one declarative cross-argument relation.
 *
 * @param {*} relation - Candidate relation.
 * @returns {boolean} Whether the relation has a supported closed shape.
 */
function isOperationProfileRelation(relation) {
    return !!relation && RELATION_TYPES.has(relation.type) &&
        hasExactDataProperties(relation, ["type", "valueArgumentIndex", "alphabetArgumentIndex"]) &&
        Number.isSafeInteger(relation.valueArgumentIndex) && relation.valueArgumentIndex >= 0 &&
        Number.isSafeInteger(relation.alphabetArgumentIndex) && relation.alphabetArgumentIndex >= 0 &&
        relation.valueArgumentIndex !== relation.alphabetArgumentIndex;
}


/**
 * Expands a bounded printable ASCII alphabet with core CyberChef semantics.
 *
 * @param {*} value - Candidate alphabet expression.
 * @param {Object} rule - Alphabet profile rule.
 * @returns {string[]|null} Expanded symbols or null when the expression is unsafe.
 */
function expandProfileAlphabet(value, rule) {
    if (typeof value !== "string" || [...value].length < 1 ||
        [...value].length > rule.maximumExpressionCodePoints ||
        [...value].some(character => {
            const codePoint = character.codePointAt(0);
            return codePoint < 0x20 || codePoint > 0x7e;
        })) {
        return null;
    }
    const symbols = Utils.expandAlphRange(value);
    return symbols.length === rule.symbolCount && new Set(symbols).size === symbols.length ? symbols : null;
}


/**
 * Applies one finite Agent overlay rule to a candidate argument.
 *
 * @param {Object} rule - Validated profile rule.
 * @param {*} value - Candidate argument value.
 * @param {Array} values - Complete argument list for dependencies.
 * @returns {boolean} Whether the argument satisfies the overlay.
 */
function matchesOperationProfileRule(rule, value, values) {
    if (!isOperationProfileRule(rule)) return false;
    if (rule.type === PROFILE_ARGUMENT_RULE.BOOLEAN) return typeof value === "boolean";
    if (rule.type === PROFILE_ARGUMENT_RULE.CONSTANT) return Object.is(value, rule.value);
    if (rule.type === PROFILE_ARGUMENT_RULE.ENUM) {
        return rule.values.some(candidate => Object.is(candidate, value));
    }
    if (rule.type === PROFILE_ARGUMENT_RULE.INTEGER) {
        return Number.isSafeInteger(value) && value >= rule.minimum && value <= rule.maximum;
    }
    if (rule.type === PROFILE_ARGUMENT_RULE.STRING) {
        if (typeof value !== "string") return false;
        const characters = [...value];
        return characters.length >= rule.minimumCodePoints &&
            characters.length <= rule.maximumCodePoints && characters.every(character => {
            const codePoint = character.codePointAt(0);
            return codePoint >= rule.minimumCharacterCodePoint &&
                codePoint <= rule.maximumCharacterCodePoint;
        });
    }
    if (rule.type === PROFILE_ARGUMENT_RULE.ALPHABET) {
        return expandProfileAlphabet(value, rule) !== null;
    }
    const selectedRule = Object.is(values[rule.argumentIndex], rule.value) ?
        rule.matchedRule : rule.unmatchedRule;
    return matchesOperationProfileRule(selectedRule, value, values);
}


/**
 * Applies all finite cross-argument relations in one profile.
 *
 * @param {Object[]} relations - Validated relation rules.
 * @param {Array} values - Complete Operation arguments.
 * @param {Object[]} argumentRules - Complete profile argument rules.
 * @returns {boolean} Whether every relation is satisfied.
 */
function matchesOperationProfileRelations(relations, values, argumentRules) {
    for (const relation of relations) {
        if (!isOperationProfileRelation(relation)) return false;
        if (relation.valueArgumentIndex >= values.length || relation.alphabetArgumentIndex >= values.length) {
            return false;
        }
        const alphabetRuleValue = argumentRules[relation.alphabetArgumentIndex];
        if (alphabetRuleValue?.type !== PROFILE_ARGUMENT_RULE.ALPHABET) return false;
        const symbols = expandProfileAlphabet(values[relation.alphabetArgumentIndex], alphabetRuleValue),
            value = values[relation.valueArgumentIndex];
        if (!symbols || typeof value !== "string" || [...value].length > 1 ||
            value && symbols.includes(value)) return false;
    }
    return true;
}

export {
    PROFILE_ARGUMENT_RULE,
    PROFILE_RELATION_RULE,
    alphabetRule,
    booleanRule,
    conditionalRule,
    constantRule,
    enumRule,
    expandProfileAlphabet,
    integerRule,
    isOperationProfileRelation,
    isOperationProfileRule,
    isProfilePrimitive,
    matchesOperationProfileRelations,
    matchesOperationProfileRule,
    notInAlphabetRelation,
    stringRule,
};
