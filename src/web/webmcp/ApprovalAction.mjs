import {copyJsonValue} from "./JsonValue.mjs";
import {
    TOOL_INPUT_MAX_DEPTH,
    TOOL_INPUT_MAX_NODES,
} from "./ToolInput.mjs";

const APPROVAL_ACTION_BINDING_DEPTH = 4,
    APPROVAL_ACTION_BINDING_NODES = 64,
    MAX_APPROVAL_ACTION_DEPTH = TOOL_INPUT_MAX_DEPTH + APPROVAL_ACTION_BINDING_DEPTH,
    MAX_APPROVAL_ACTION_NODES = TOOL_INPUT_MAX_NODES + APPROVAL_ACTION_BINDING_NODES;


/**
 * Serializes a detached JSON value with stable object-key ordering.
 *
 * @param {*} value - Validated JSON value.
 * @returns {string} Canonical JSON representation.
 */
function serializeCanonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(serializeCanonicalJson).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${serializeCanonicalJson(value[key])}`
        ).join(",")}}`;
    }
    return JSON.stringify(value);
}


/**
 * Creates a stable digest for one exact approval action.
 *
 * @param {*} action - JSON action whose values define the authorized behavior.
 * @returns {Promise<string>} Lowercase SHA-256 digest.
 * @throws {TypeError|RangeError} When the action is unsafe or exceeds its limits.
 */
async function fingerprintApprovalAction(action) {
    const {value} = copyJsonValue(
            action,
            MAX_APPROVAL_ACTION_DEPTH,
            MAX_APPROVAL_ACTION_NODES
        ),
        serialized = serializeCanonicalJson(value),
        subtle = globalThis.crypto?.subtle;

    if (!subtle) throw new Error("Secure action fingerprinting is unavailable");

    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(serialized));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export {
    fingerprintApprovalAction,
    MAX_APPROVAL_ACTION_DEPTH,
    MAX_APPROVAL_ACTION_NODES,
};
