import {
    RECIPE_TRANSACTION_ERROR_CODE,
    RECIPE_TRANSACTION_STATUS,
    RecipeTransactionError,
} from "../recipe/RecipeTransaction.mjs";
import {USER_BAKE_REQUIRED} from "./BakeResultContext.mjs";
import {
    APPROVAL_ERROR_CODE,
    APPROVAL_MODE,
    APPROVAL_STATE,
    ApprovalError,
} from "./ApprovalCoordinator.mjs";
import {createApprovalErrorContext} from "./ApprovalResultContext.mjs";
import {ToolExecutionError} from "./ToolExecutor.mjs";
import {TOOL_NAME} from "./ToolDefinitions.mjs";
import {
    TOOL_ERROR_CODE,
    isSuccessResultWithinBudget,
} from "./ToolResult.mjs";

const RECIPE_STATE_DEFAULT_LIMIT = 20;


/**
 * Projects one Recipe step through the workspace disclosure allowlist.
 *
 * @param {Object} step - Redacted Recipe model step.
 * @returns {Object} Public Recipe structure without argument values.
 */
function createRecipeStepState(step) {
    return {
        stepId: step.stepId,
        operationName: step.operationName,
        enabled: step.disabled !== true,
        breakpoint: step.breakpoint === true,
        argumentStates: step.argumentStates.map(argument => ({
            index: argument.index,
            configured: argument.configured === true,
        })),
    };
}


/**
 * Maps Recipe transaction failures into the reviewed public error catalog.
 *
 * @param {Error} error - Failure from the Recipe transaction service.
 * @returns {string} Public error code.
 */
function mapRecipeTransactionError(error) {
    if (!(error instanceof RecipeTransactionError)) return TOOL_ERROR_CODE.INTERNAL_ERROR;
    if (error.code === RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE) {
        return TOOL_ERROR_CODE.STALE_RECIPE;
    }
    if (error.code === RECIPE_TRANSACTION_ERROR_CODE.BAKE_BUSY) {
        return TOOL_ERROR_CODE.BAKE_BUSY;
    }
    if (error.code === RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH) {
        return error.patchCode === "STEP_NOT_FOUND" || error.patchCode === "ANCHOR_NOT_FOUND" ?
            TOOL_ERROR_CODE.UNKNOWN_STEP : TOOL_ERROR_CODE.INVALID_PATCH;
    }
    if (error.code === RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED) {
        return TOOL_ERROR_CODE.RISK_BLOCKED;
    }
    return TOOL_ERROR_CODE.INTERNAL_ERROR;
}


/**
 * Counts committed actions without retaining submitted values or Operation names.
 *
 * @param {Object[]} actions - Trusted transaction action records.
 * @returns {Object} Total and per-action counts.
 */
function createActionSummary(actions) {
    const actionCounts = {};
    for (const action of actions) {
        actionCounts[action.type] = (actionCounts[action.type] ?? 0) + 1;
    }
    return {
        actionCount: actions.length,
        actionCounts,
    };
}


/**
 * Creates the exact mutation action bound to the visible approval request.
 *
 * @param {Object} input - Schema-validated patch input.
 * @param {Object} workspaceBinding - Content-free active workspace identity.
 * @returns {Object} Exact approval action without the request reference.
 */
function createRecipeApprovalAction(input, workspaceBinding) {
    return {
        kind: "recipeMutation",
        expectedRevision: input.expectedRevision,
        changes: input.changes,
        workspaceBinding,
    };
}


/**
 * Creates Recipe collaboration handlers around the shared Recipe service.
 *
 * @param {Object} recipeWaiter - Recipe state and transaction service.
 * @param {Object|null} [runStateService=null] - Optional active Run state service.
 * @param {ApprovalCoordinator|null} [approvals=null] - Optional one-use approval owner.
 * @returns {Object} Handlers keyed by formal tool name.
 */
function createRecipeToolHandlers(recipeWaiter, runStateService=null, approvals=null) {
    if (!recipeWaiter || typeof recipeWaiter.getReadProjection !== "function" ||
        typeof recipeWaiter.applyAgentPatch !== "function" ||
        runStateService !== null && typeof runStateService.getActiveState !== "function" ||
        approvals !== null && (
            typeof approvals.requestApproval !== "function" ||
            typeof approvals.consumeMutation !== "function" ||
            typeof approvals.completeMutation !== "function" ||
            typeof approvals.getState !== "function" ||
            typeof recipeWaiter.prepareAgentPatch !== "function" ||
            typeof recipeWaiter.commitAgentPatch !== "function" ||
            typeof recipeWaiter.commitApprovedAgentPatch !== "function"
        )) {
        throw new TypeError("Recipe tool handlers require the Recipe service");
    }

    /**
     * Returns the current profile's authorized Recipe and Run state fields.
     *
     * @param {Object} invocation - Active collaboration invocation guard.
     * @param {number} recipeRevision - Current Recipe revision.
     * @returns {Object} Profile-specific content-free state.
     */
    function createCollaborationState(invocation, recipeRevision) {
        return {
            sessionEpoch: invocation.sessionEpoch,
            recipeRevision,
            ...(runStateService ? runStateService.getActiveState(recipeRevision) : {
                executionCapability: USER_BAKE_REQUIRED,
            }),
        };
    }

    /**
     * Returns one revision-bound page of redacted visible Recipe structure.
     *
     * @param {Object} input - Schema-validated Recipe state input.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Object} Handler data and Recipe collaboration state.
     */
    function getRecipeState(input, invocation) {
        invocation.checkpoint();
        const projection = recipeWaiter.getReadProjection();
        if (typeof input.expectedRevision !== "undefined" &&
            input.expectedRevision !== projection.recipeRevision) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.STALE_RECIPE);
        }

        const offset = input.offset ?? 0,
            limit = input.limit ?? RECIPE_STATE_DEFAULT_LIMIT,
            requestedSteps = projection.steps
                .slice(offset, offset + limit)
                .map(createRecipeStepState),
            state = createCollaborationState(invocation, projection.recipeRevision);
        let stepCount = requestedSteps.length,
            data;

        do {
            const steps = requestedSteps.slice(0, stepCount);
            data = {
                steps,
                total: projection.steps.length,
                offset,
                limit,
                nextOffset: offset + steps.length < projection.steps.length ?
                    offset + steps.length : null,
            };
            if (isSuccessResultWithinBudget(data, state)) break;
            stepCount--;
        } while (stepCount >= 0);

        if (stepCount < 0) throw new ToolExecutionError(TOOL_ERROR_CODE.RESULT_TOO_LARGE);
        return {data, state};
    }

    /**
     * Commits one authorized Recipe patch and returns a value-redacted summary.
     *
     * @param {Object} input - Schema-validated Recipe patch input.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Object} Handler data and resulting Recipe collaboration state.
     */
    function applyRecipePatch(input, invocation) {
        invocation.checkpoint();

        if (!approvals) return commitStandardPatch(input, invocation);

        let preparedPatch;
        try {
            preparedPatch = recipeWaiter.prepareAgentPatch(input);
        } catch (err) {
            throw new ToolExecutionError(mapRecipeTransactionError(err));
        }

        if (preparedPatch.authorization?.approvalRequired !== true) {
            if (typeof input.recipeApprovalRequestId !== "undefined") {
                throw new ToolExecutionError(TOOL_ERROR_CODE.INVALID_REQUEST);
            }
            return commitPreparedStandardPatch(preparedPatch, invocation);
        }
        return applyApprovedPatch(input, preparedPatch, invocation);
    }

    /**
     * Preserves the standard policy path when no approval owner is configured.
     *
     * @param {Object} input - Schema-validated Recipe patch input.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Object} Handler result.
     */
    function commitStandardPatch(input, invocation) {
        let result;
        try {
            result = recipeWaiter.applyAgentPatch(
                input,
                () => invocation.createApplicationWork()
            );
        } catch (err) {
            throw new ToolExecutionError(mapRecipeTransactionError(err));
        }

        return createPatchResult(result, invocation, false);
    }

    /**
     * Commits a prepared standard-policy patch with its existing Auto Bake contract.
     *
     * @param {Object} preparedPatch - Waiter-owned one-use patch.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Object} Handler result.
     */
    function commitPreparedStandardPatch(preparedPatch, invocation) {
        let result;
        try {
            result = recipeWaiter.commitAgentPatch(
                preparedPatch,
                () => invocation.createApplicationWork()
            );
        } catch (err) {
            throw new ToolExecutionError(mapRecipeTransactionError(err));
        }

        return createPatchResult(result, invocation, false);
    }

    /**
     * Requests or consumes a one-use approval before committing a sensitive patch.
     *
     * @param {Object} input - Schema-validated Recipe patch input.
     * @param {Object} preparedPatch - Waiter-owned one-use patch.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Promise<Object>} Handler result after an exact approved mutation.
     */
    async function applyApprovedPatch(input, preparedPatch, invocation) {
        const summary = preparedPatch.authorization.approvalSummary,
            workspaceBinding = preparedPatch.workspaceBinding;
        if (!summary || !workspaceBinding) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.TAB_MISMATCH);
        }

        const action = createRecipeApprovalAction(input, workspaceBinding);
        if (typeof input.recipeApprovalRequestId === "undefined") {
            let request;
            try {
                request = await approvals.requestApproval({
                    sessionEpoch: invocation.sessionEpoch,
                    action,
                    summary,
                });
            } catch (err) {
                if (err instanceof ApprovalError &&
                    err.code === APPROVAL_ERROR_CODE.REQUEST_BUSY) {
                    throw new ToolExecutionError(TOOL_ERROR_CODE.USER_ACTION_REQUIRED);
                }
                throw new ToolExecutionError(TOOL_ERROR_CODE.INTERNAL_ERROR);
            }
            invocation.checkpoint();
            throw new ToolExecutionError(
                TOOL_ERROR_CODE.USER_ACTION_REQUIRED,
                createApprovalErrorContext(
                    request,
                    invocation.sessionEpoch,
                    input.expectedRevision
                )
            );
        }

        let permit;
        try {
            permit = await approvals.consumeMutation({
                requestId: input.recipeApprovalRequestId,
                sessionEpoch: invocation.sessionEpoch,
                action,
            });
        } catch (err) {
            const request = approvals.getState();
            if (err instanceof ApprovalError &&
                err.code === APPROVAL_ERROR_CODE.REQUEST_STATE_MISMATCH &&
                request.requestId === input.recipeApprovalRequestId &&
                request.state === APPROVAL_STATE.PENDING) {
                throw new ToolExecutionError(
                    TOOL_ERROR_CODE.USER_ACTION_REQUIRED,
                    createApprovalErrorContext(
                        request,
                        invocation.sessionEpoch,
                        input.expectedRevision
                    )
                );
            }
            throw new ToolExecutionError(TOOL_ERROR_CODE.INVALID_REQUEST);
        }

        invocation.checkpoint();
        const includeBakeTarget = permit.mode === APPROVAL_MODE.RECIPE_AND_BAKE;
        let commit;
        try {
            commit = recipeWaiter.commitApprovedAgentPatch(preparedPatch, includeBakeTarget);
        } catch (err) {
            await approvals.completeMutation({
                requestId: input.recipeApprovalRequestId,
                sessionEpoch: invocation.sessionEpoch,
                succeeded: false,
            });
            throw new ToolExecutionError(mapRecipeTransactionError(err));
        }

        try {
            await approvals.completeMutation({
                requestId: input.recipeApprovalRequestId,
                sessionEpoch: invocation.sessionEpoch,
                succeeded: true,
                bakeTarget: commit.bakeTarget,
            });
        } catch {
            throw new ToolExecutionError(TOOL_ERROR_CODE.INTERNAL_ERROR);
        }
        invocation.checkpoint();
        return createPatchResult(commit.result, invocation, includeBakeTarget);
    }

    /**
     * Creates one value-redacted Recipe mutation result.
     *
     * @param {Object} result - Transaction result.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @param {boolean} approvedBakeAvailable - Whether one exact approved Bake remains.
     * @returns {Object} Handler data and collaboration state.
     */
    function createPatchResult(result, invocation, approvedBakeAvailable) {

        const actions = result.status === RECIPE_TRANSACTION_STATUS.COMMITTED ?
                result.change.actions : [],
            data = {
                status: result.status,
                summary: createActionSummary(actions),
                insertedSteps: {
                    commandIndexes: result.insertedSteps.map(step => step.commandIndex),
                    stepIds: result.insertedSteps.map(step => step.stepId),
                },
                approvedBakeAvailable,
            },
            state = createCollaborationState(invocation, result.recipeRevision);

        if (!isSuccessResultWithinBudget(data, state)) {
            throw new ToolExecutionError(TOOL_ERROR_CODE.INTERNAL_ERROR);
        }
        return {data, state};
    }

    return Object.freeze({
        [TOOL_NAME.GET_RECIPE_STATE]: getRecipeState,
        [TOOL_NAME.APPLY_RECIPE_PATCH]: applyRecipePatch,
    });
}

export {
    RECIPE_STATE_DEFAULT_LIMIT,
    USER_BAKE_REQUIRED,
    createRecipeToolHandlers,
};
