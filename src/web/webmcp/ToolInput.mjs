import { copyJsonValue } from "./JsonValue.mjs";

const TOOL_INPUT_MAX_CHARS = 64 * 1024;
const TOOL_INPUT_MAX_DEPTH = 16;
const TOOL_INPUT_MAX_NODES = 4096;

const INVALID_TOOL_INPUT = Object.freeze({
    valid: false,
});


/**
 * Checks one value against the supported schema subset.
 *
 * @param {*} value - Plain input value.
 * @param {Object} schema - Developer-defined schema.
 * @param {number} depth - Current schema depth.
 * @returns {boolean} Whether the value matches the schema.
 */
function matchesSchema(value, schema, depth) {
    if (depth > TOOL_INPUT_MAX_DEPTH || !schema || typeof schema !== "object") return false;

    if (schema.oneOf) {
        let matches = 0;
        for (const candidate of schema.oneOf) {
            if (matchesSchema(value, candidate, depth + 1)) matches++;
        }
        return matches === 1;
    }

    if (schema.anyOf) return schema.anyOf.some(candidate => matchesSchema(value, candidate, depth + 1));

    if (Object.prototype.hasOwnProperty.call(schema, "const") && !Object.is(value, schema.const)) {
        return false;
    }

    if (schema.enum && !schema.enum.some(candidate => Object.is(value, candidate))) return false;

    switch (schema.type) {
        case "object": {
            if (value === null || typeof value !== "object" || Array.isArray(value)) return false;

            const properties = schema.properties || {},
                keys = Object.keys(value);

            if (typeof schema.maxProperties === "number" && keys.length > schema.maxProperties) return false;

            for (const required of schema.required || []) {
                if (!Object.prototype.hasOwnProperty.call(value, required)) return false;
            }

            for (const key of keys) {
                if (!Object.prototype.hasOwnProperty.call(properties, key)) {
                    if (schema.additionalProperties !== true) return false;
                    continue;
                }
                if (!matchesSchema(value[key], properties[key], depth + 1)) return false;
            }
            return true;
        }
        case "array":
            if (!Array.isArray(value)) return false;
            if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
            if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
            return !schema.items || value.every(item => matchesSchema(item, schema.items, depth + 1));
        case "string": {
            if (typeof value !== "string") return false;
            const length = [...value].length;
            if (typeof schema.minLength === "number" && length < schema.minLength) return false;
            if (typeof schema.maxLength === "number" && length > schema.maxLength) return false;
            if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) {
                return false;
            }
            return true;
        }
        case "integer":
            if (!Number.isSafeInteger(value)) return false;
            break;
        case "number":
            if (typeof value !== "number" || !Number.isFinite(value)) return false;
            break;
        case "boolean":
            return typeof value === "boolean";
        default:
            return false;
    }

    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
    return true;
}


/**
 * Validates and detaches one tool input at the provider boundary.
 *
 * @param {*} input - Host-provided tool input.
 * @param {Object} schema - Fixed tool input schema.
 * @returns {{valid: boolean, value?: Object}} Validation result and detached input.
 */
function validateToolInput(input, schema) {
    let copy;

    try {
        copy = copyJsonValue(input, TOOL_INPUT_MAX_DEPTH, TOOL_INPUT_MAX_NODES);
    } catch (err) {
        return INVALID_TOOL_INPUT;
    }

    if (copy.serialized.length > TOOL_INPUT_MAX_CHARS || !matchesSchema(copy.value, schema, 0)) {
        return INVALID_TOOL_INPUT;
    }

    return {
        valid: true,
        value: copy.value,
    };
}

export {
    TOOL_INPUT_MAX_CHARS,
    TOOL_INPUT_MAX_DEPTH,
    TOOL_INPUT_MAX_NODES,
    validateToolInput,
};
