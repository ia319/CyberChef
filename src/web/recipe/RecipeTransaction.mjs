import {RecipeModel} from "./RecipeModel.mjs";
import {
    RecipePatchError,
    applyRecipePatch,
} from "./RecipePatch.mjs";
import {evaluateOperationMutation} from "../webmcp/OperationPermissions.mjs";
import {preflightOperationRecipe} from "../webmcp/OperationPreflight.mjs";
import {
    getOperationProfile,
    resolveOperationProfileArguments,
} from "../webmcp/OperationProfiles.mjs";
import {TOOL_CONTRACTS, TOOL_NAME} from "../webmcp/ToolDefinitions.mjs";
import {validateToolInput} from "../webmcp/ToolInput.mjs";

const RECIPE_TRANSACTION_ACTOR = Object.freeze({
    AGENT: "agent",
});

const RECIPE_TRANSACTION_SOURCE = Object.freeze({
    WEBMCP: "webmcp",
});

const RECIPE_TRANSACTION_STATUS = Object.freeze({
    COMMITTED: "committed",
    UNCHANGED: "unchanged",
});

const RECIPE_TRANSACTION_ERROR_CODE = Object.freeze({
    INVALID_PATCH: "INVALID_PATCH",
    STALE_RECIPE: "STALE_RECIPE",
    POLICY_BLOCKED: "POLICY_BLOCKED",
    BAKE_BUSY: "BAKE_BUSY",
    PROJECTION_FAILED: "PROJECTION_FAILED",
    ROLLBACK_FAILED: "ROLLBACK_FAILED",
});

const APPLY_RECIPE_PATCH_SCHEMA = TOOL_CONTRACTS[TOOL_NAME.APPLY_RECIPE_PATCH].inputSchema;


/**
 * Represents a bounded Recipe transaction failure without workspace values.
 */
class RecipeTransactionError extends Error {
    /**
     * Creates a Recipe transaction error.
     *
     * @param {string} code - Fixed transaction error code.
     * @param {Object} [details={}] - Fixed diagnostic fields.
     */
    constructor(code, details={}) {
        super("Recipe transaction could not be committed");
        this.name = "RecipeTransactionError";
        this.code = code;
        if (Number.isSafeInteger(details.commandIndex)) this.commandIndex = details.commandIndex;
        if (typeof details.patchCode === "string") this.patchCode = details.patchCode;
        if (typeof details.policyCode === "string") this.policyCode = details.policyCode;
    }
}


/**
 * Converts model steps to the Operation policy input shape.
 *
 * @param {Object[]} steps - Prepared Recipe model steps.
 * @returns {Object[]} Complete post-change Recipe for preflight.
 */
function createPreflightRecipe(steps) {
    return steps.map(step => ({
        operationName: step.operation.op,
        arguments: step.operation.args,
        disabled: step.operation.disabled === true,
    }));
}


/**
 * Supplies reviewed defaults for insert commands before the patch engine runs.
 *
 * @param {Object[]} changes - Detached schema-validated commands.
 * @returns {Object[]} Commands with complete insert arguments.
 */
function normalizeAgentChanges(changes) {
    return changes.map((change, commandIndex) => {
        if (change.type !== "insert") return change;

        const profile = getOperationProfile(change.operation);
        if (!profile) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED, {
                commandIndex,
                policyCode: "PROFILE_REQUIRED",
            });
        }

        const argumentResult = resolveOperationProfileArguments(profile, change.arguments);
        if (!argumentResult.valid) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH, {
                commandIndex,
                patchCode: argumentResult.code,
            });
        }
        return {...change, arguments: argumentResult.arguments};
    });
}


/**
 * Runs synchronous Recipe validation and publication for Agent patches.
 */
class RecipeTransaction {
    #model;
    #projectionAdapter;
    #nextStepNumber;
    #nextChangeNumber;

    /**
     * Creates a Recipe transaction owner.
     *
     * @param {RecipeModel} model - Page-lifetime Recipe model.
     * @param {Object} projectionAdapter - Synchronous detached DOM projection adapter.
     */
    constructor(model, projectionAdapter) {
        if (!(model instanceof RecipeModel)) {
            throw new TypeError("Recipe transaction requires a RecipeModel");
        }
        if (!projectionAdapter || typeof projectionAdapter.prepare !== "function") {
            throw new TypeError("Recipe transaction requires a projection adapter");
        }

        this.#model = model;
        this.#projectionAdapter = projectionAdapter;
        this.#nextStepNumber = 0;
        this.#nextChangeNumber = 0;
    }


    /**
     * Applies one schema-validated Agent patch as a synchronous transaction.
     *
     * @param {*} input - Raw apply_recipe_patch input.
     * @returns {Object} Immutable transaction result without Recipe arguments.
     * @throws {RecipeTransactionError} When validation, policy, revision, or projection fails.
     */
    applyAgentPatch(input) {
        const validation = validateToolInput(input, APPLY_RECIPE_PATCH_SCHEMA);
        if (!validation.valid) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH);
        }

        const snapshot = this.#model.getSnapshot();
        if (validation.value.expectedRevision !== snapshot.recipeRevision) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE);
        }

        const changes = normalizeAgentChanges(validation.value.changes),
            usedStepIds = new Set(snapshot.steps.map(step => step.stepId));
        let patch,
            draftStepNumber = this.#nextStepNumber;
        try {
            patch = applyRecipePatch(snapshot, changes, () => {
                let stepId;
                do {
                    if (draftStepNumber === Number.MAX_SAFE_INTEGER) {
                        throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH);
                    }
                    stepId = `transaction-step-${++draftStepNumber}`;
                } while (usedStepIds.has(stepId));
                usedStepIds.add(stepId);
                return stepId;
            });
        } catch (err) {
            if (err instanceof RecipeTransactionError) throw err;
            if (err instanceof RecipePatchError) {
                throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH, {
                    commandIndex: err.commandIndex,
                    patchCode: err.code,
                });
            }
            throw err;
        }

        const postflight = preflightOperationRecipe(createPreflightRecipe(patch.steps));
        for (const action of patch.actions) {
            const decision = evaluateOperationMutation(action.type, action.operationName, postflight);
            if (!decision.allowed) {
                throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED, {
                    commandIndex: action.commandIndex,
                    policyCode: decision.code,
                });
            }
        }

        if (this.#model.getSnapshot().recipeRevision !== validation.value.expectedRevision) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE);
        }

        const newStepIds = patch.insertedSteps.map(item => item.stepId),
            preparedModel = this.#model.prepareProjectedSteps(patch.steps, newStepIds);
        if (!preparedModel.changed) {
            return Object.freeze({
                status: RECIPE_TRANSACTION_STATUS.UNCHANGED,
                recipeRevision: snapshot.recipeRevision,
                insertedSteps: Object.freeze([]),
            });
        }

        let preparedProjection;
        try {
            preparedProjection = this.#projectionAdapter.prepare(preparedModel.steps);
        } catch (err) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.PROJECTION_FAILED);
        }
        if (!preparedProjection || typeof preparedProjection !== "object" ||
            typeof preparedProjection.publish !== "function" ||
            typeof preparedProjection.rollback !== "function" ||
            typeof preparedProjection.then === "function") {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.PROJECTION_FAILED);
        }
        if (this.#model.getSnapshot().recipeRevision !== validation.value.expectedRevision) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE);
        }

        let publicationStarted = false;
        try {
            publicationStarted = true;
            const publicationResult = preparedProjection.publish();
            if (publicationResult && typeof publicationResult.then === "function") {
                throw new TypeError("Recipe projection publication must be synchronous");
            }
            this.#model.commitPreparedProjection(preparedModel);
        } catch (err) {
            let rollbackFailed = false;
            if (publicationStarted) {
                try {
                    preparedProjection.rollback();
                } catch (rollbackErr) {
                    rollbackFailed = true;
                }
            }
            if (rollbackFailed) {
                throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.ROLLBACK_FAILED);
            }
            const code = err instanceof RangeError ?
                RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE :
                RECIPE_TRANSACTION_ERROR_CODE.PROJECTION_FAILED;
            throw new RecipeTransactionError(code);
        }

        const afterRevision = this.#model.getSnapshot().recipeRevision,
            change = Object.freeze({
                changeId: `recipe-change-${++this.#nextChangeNumber}`,
                actor: RECIPE_TRANSACTION_ACTOR.AGENT,
                source: RECIPE_TRANSACTION_SOURCE.WEBMCP,
                beforeRevision: snapshot.recipeRevision,
                afterRevision,
            });
        this.#nextStepNumber = draftStepNumber;
        return Object.freeze({
            status: RECIPE_TRANSACTION_STATUS.COMMITTED,
            recipeRevision: afterRevision,
            insertedSteps: patch.insertedSteps,
            change,
        });
    }
}

export {
    RECIPE_TRANSACTION_ACTOR,
    RECIPE_TRANSACTION_ERROR_CODE,
    RECIPE_TRANSACTION_SOURCE,
    RECIPE_TRANSACTION_STATUS,
    RecipeTransaction,
    RecipeTransactionError,
};
