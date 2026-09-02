import {APPROVAL_STATE} from "./ApprovalCoordinator.mjs";

const APPROVAL_RESULT_STATES = new Set([
    APPROVAL_STATE.PENDING,
    APPROVAL_STATE.APPROVED,
]);


/**
 * Checks an exact set of enumerable data properties without invoking accessors.
 *
 * @param {*} value - Candidate plain object.
 * @param {Array<string>} fields - Exact allowed field names.
 * @returns {boolean} Whether the object has only supported data properties.
 */
function hasExactDataFields(value, fields) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value),
        keys = Reflect.ownKeys(descriptors);
    return keys.length === fields.length && keys.every(key =>
        typeof key === "string" && fields.includes(key) &&
        descriptors[key].enumerable && "value" in descriptors[key]
    );
}


/**
 * Creates the only approval context allowed in a tool error result.
 *
 * @param {Object} request - Public approval coordinator state.
 * @param {number|string} sessionEpoch - Active collaboration epoch.
 * @param {number} recipeRevision - Recipe revision bound to the request.
 * @returns {Object} Bounded content-free approval context.
 */
function createApprovalErrorContext(request, sessionEpoch, recipeRevision) {
    return {
        approvalRequestId: request.requestId,
        state: {
            sessionEpoch,
            recipeRevision,
            approvalState: request.state,
        },
    };
}


/**
 * Validates the fixed approval error context allowlist.
 *
 * @param {string} code - Public tool error code.
 * @param {*} context - Candidate approval context.
 * @returns {boolean} Whether the context is safe to serialize.
 */
function isApprovalErrorContext(code, context) {
    if (code !== "USER_ACTION_REQUIRED" ||
        !hasExactDataFields(context, ["approvalRequestId", "state"]) ||
        typeof context.approvalRequestId !== "string" ||
        !/^[A-Za-z0-9_-]{16,128}$/u.test(context.approvalRequestId)) {
        return false;
    }

    const state = context.state;
    if (!hasExactDataFields(state, ["sessionEpoch", "recipeRevision", "approvalState"])) {
        return false;
    }
    const epochValid = Number.isSafeInteger(state.sessionEpoch) && state.sessionEpoch >= 0 ||
        typeof state.sessionEpoch === "string" && state.sessionEpoch.length > 0 &&
            state.sessionEpoch.length <= 128;
    return epochValid && Number.isSafeInteger(state.recipeRevision) && state.recipeRevision >= 0 &&
        APPROVAL_RESULT_STATES.has(state.approvalState);
}

export {
    createApprovalErrorContext,
    isApprovalErrorContext,
};
