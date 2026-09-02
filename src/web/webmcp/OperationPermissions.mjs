import {
    OPERATION_ACCESS,
    OPERATION_ACCESS_AUDIT,
} from "./OperationAccessAudit.mjs";

const OPERATION_POLICY = Object.freeze({
    ALLOWED: "allowed",
    BLOCKED: "blocked",
    USER_ACTION_REQUIRED: "userActionRequired",
});

const MUTATION_ACTION = Object.freeze({
    INSERT: "insert",
    ENABLE: "enable",
    SET_ARGUMENT: "setArgument",
    MOVE: "move",
    REMOVE: "remove",
    DISABLE: "disable",
    SET_BREAKPOINT: "setBreakpoint",
});

const MUTATION_DECISION_CODE = Object.freeze({
    ALLOWED: "ALLOWED",
    ACTION_BLOCKED: "ACTION_BLOCKED",
    INVALID_RECIPE: "INVALID_RECIPE",
    RECIPE_BLOCKED: "RECIPE_BLOCKED",
    UNKNOWN_OPERATION: "UNKNOWN_OPERATION",
});

const SAFE_MUTATION_ACTIONS = Object.freeze([
    MUTATION_ACTION.INSERT,
    MUTATION_ACTION.ENABLE,
    MUTATION_ACTION.SET_ARGUMENT,
    MUTATION_ACTION.MOVE,
    MUTATION_ACTION.REMOVE,
    MUTATION_ACTION.DISABLE,
    MUTATION_ACTION.SET_BREAKPOINT,
]);

const REDUCTION_MUTATION_ACTIONS = Object.freeze([
    MUTATION_ACTION.REMOVE,
    MUTATION_ACTION.DISABLE,
]);

const NO_MUTATION_ACTIONS = Object.freeze([]);

const UNKNOWN_OPERATION_PERMISSIONS = Object.freeze({
    discoverable: false,
    operationAccess: OPERATION_ACCESS.UNREVIEWED,
    supportedMutationActions: NO_MUTATION_ACTIONS,
    agentBakeAllowed: false,
    mutationPolicy: OPERATION_POLICY.BLOCKED,
    agentBakePolicy: OPERATION_POLICY.BLOCKED,
});

const PERMISSIONS_BY_NAME = new Map(OPERATION_ACCESS_AUDIT.getOperationNames().map(operationName => {
    const access = OPERATION_ACCESS_AUDIT.getOperationAccess(operationName),
        direct = access === OPERATION_ACCESS.DIRECT,
        approval = access === OPERATION_ACCESS.APPROVAL,
        excluded = access === OPERATION_ACCESS.EXCLUDED,
        mutationPolicy = direct ? OPERATION_POLICY.ALLOWED :
            approval ? OPERATION_POLICY.USER_ACTION_REQUIRED : OPERATION_POLICY.BLOCKED,
        agentBakePolicy = mutationPolicy,
        permissions = Object.freeze({
            discoverable: !excluded,
            operationAccess: access,
            supportedMutationActions: excluded ? NO_MUTATION_ACTIONS :
                direct || approval ? SAFE_MUTATION_ACTIONS : REDUCTION_MUTATION_ACTIONS,
            agentBakeAllowed: direct,
            mutationPolicy,
            agentBakePolicy,
        });
    return [operationName, permissions];
}));


/**
 * Returns static discovery, mutation, and Agent Bake permissions.
 *
 * @param {string} operationName - Exact Operation name.
 * @returns {Object} Immutable permission record.
 */
function getOperationPermissions(operationName) {
    return PERMISSIONS_BY_NAME.get(operationName) ?? UNKNOWN_OPERATION_PERMISSIONS;
}


/**
 * Applies action-specific mutation policy to a post-change Recipe preflight.
 *
 * @param {string} action - Mutation action from MUTATION_ACTION.
 * @param {string} operationName - Operation affected by the action.
 * @param {Object} postflight - Preflight result for the complete post-change Recipe.
 * @returns {Object} Fixed mutation decision.
 */
function evaluateOperationMutation(action, operationName, postflight) {
    if (!Object.values(MUTATION_ACTION).includes(action)) {
        return Object.freeze({allowed: false, code: MUTATION_DECISION_CODE.ACTION_BLOCKED});
    }
    if (!postflight || postflight.recipeValid !== true) {
        return Object.freeze({allowed: false, code: MUTATION_DECISION_CODE.INVALID_RECIPE});
    }
    if (REDUCTION_MUTATION_ACTIONS.includes(action)) {
        return Object.freeze({allowed: true, code: MUTATION_DECISION_CODE.ALLOWED});
    }

    const permissions = getOperationPermissions(operationName);
    if (!permissions.discoverable) {
        return Object.freeze({allowed: false, code: MUTATION_DECISION_CODE.UNKNOWN_OPERATION});
    }
    if (!permissions.supportedMutationActions.includes(action)) {
        return Object.freeze({allowed: false, code: MUTATION_DECISION_CODE.ACTION_BLOCKED});
    }
    if (!postflight.standardModificationAllowed) {
        if (postflight.approvalModificationAllowed === true) {
            return Object.freeze({
                allowed: true,
                code: MUTATION_DECISION_CODE.ALLOWED,
                approvalRequired: true,
            });
        }
        return Object.freeze({allowed: false, code: MUTATION_DECISION_CODE.RECIPE_BLOCKED});
    }
    return Object.freeze({allowed: true, code: MUTATION_DECISION_CODE.ALLOWED});
}

export {
    MUTATION_ACTION,
    MUTATION_DECISION_CODE,
    evaluateOperationMutation,
    getOperationPermissions,
};
