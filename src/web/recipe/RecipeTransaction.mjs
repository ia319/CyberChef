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
    SYSTEM: "system",
    USER: "user",
});

const RECIPE_TRANSACTION_SOURCE = Object.freeze({
    WEBMCP: "webmcp",
    INGREDIENT: "ingredient",
    SORT: "sort",
    INSERT: "insert",
    REMOVE: "remove",
    CLEAR: "clear",
    DISABLE: "disable",
    BREAKPOINT: "breakpoint",
    KEYBOARD: "keyboard",
    API: "api",
    SAVED_RECIPE: "savedRecipe",
    MAGIC: "magic",
    URL: "url",
});

const USER_TRANSACTION_SOURCES = new Set([
    RECIPE_TRANSACTION_SOURCE.INGREDIENT,
    RECIPE_TRANSACTION_SOURCE.SORT,
    RECIPE_TRANSACTION_SOURCE.INSERT,
    RECIPE_TRANSACTION_SOURCE.REMOVE,
    RECIPE_TRANSACTION_SOURCE.CLEAR,
    RECIPE_TRANSACTION_SOURCE.DISABLE,
    RECIPE_TRANSACTION_SOURCE.BREAKPOINT,
    RECIPE_TRANSACTION_SOURCE.KEYBOARD,
    RECIPE_TRANSACTION_SOURCE.API,
    RECIPE_TRANSACTION_SOURCE.SAVED_RECIPE,
    RECIPE_TRANSACTION_SOURCE.MAGIC,
]);

const SYSTEM_TRANSACTION_SOURCES = new Set([
    RECIPE_TRANSACTION_SOURCE.URL,
]);

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
 * Owns synchronous Recipe validation, attribution, and publication.
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
     * Commits a prepared Recipe model and creates its structured change.
     *
     * @param {Object} preparedModel - One-use prepared RecipeModel projection.
     * @param {Object} snapshot - Pre-change Recipe model snapshot.
     * @param {string} actor - Trusted transaction actor.
     * @param {string} source - Trusted transaction source.
     * @param {Object[]} [insertedSteps=[]] - Inserted command identities.
     * @returns {Object} Immutable transaction result.
     */
    #commitPreparedModel(preparedModel, snapshot, actor, source, insertedSteps=[]) {
        this.#model.commitPreparedProjection(preparedModel);
        if (!preparedModel.changed) {
            return Object.freeze({
                status: RECIPE_TRANSACTION_STATUS.UNCHANGED,
                recipeRevision: snapshot.recipeRevision,
                insertedSteps: Object.freeze([]),
            });
        }

        const afterRevision = this.#model.getSnapshot().recipeRevision,
            change = Object.freeze({
                changeId: `recipe-change-${++this.#nextChangeNumber}`,
                actor,
                source,
                beforeRevision: snapshot.recipeRevision,
                afterRevision,
            });
        return Object.freeze({
            status: RECIPE_TRANSACTION_STATUS.COMMITTED,
            recipeRevision: afterRevision,
            insertedSteps,
            change,
        });
    }


    /**
     * Publishes one prepared model and its structured change exactly once.
     *
     * @param {Object} preparedModel - One-use prepared RecipeModel projection.
     * @param {Object} snapshot - Pre-change Recipe model snapshot.
     * @param {string} actor - Trusted transaction actor.
     * @param {string} source - Trusted transaction source.
     * @param {Object[]} [insertedSteps=[]] - Inserted command identities.
     * @returns {Object} Immutable transaction result.
     */
    #publishPreparedModel(preparedModel, snapshot, actor, source, insertedSteps=[]) {
        if (!preparedModel.changed) {
            return this.#commitPreparedModel(preparedModel, snapshot, actor, source, insertedSteps);
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
        if (this.#model.getSnapshot().recipeRevision !== snapshot.recipeRevision) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE);
        }

        let publicationStarted = false;
        try {
            publicationStarted = true;
            const publicationResult = preparedProjection.publish();
            if (publicationResult && typeof publicationResult.then === "function") {
                throw new TypeError("Recipe projection publication must be synchronous");
            }
            return this.#commitPreparedModel(
                preparedModel,
                snapshot,
                actor,
                source,
                insertedSteps
            );
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
    }


    /**
     * Commits a visible user Recipe projection without applying Agent policy.
     *
     * @param {Object[]} projectedSteps - Complete visible Recipe projection.
     * @param {string} source - Trusted user mutation source.
     * @returns {Object} Immutable transaction result.
     */
    commitUserProjection(projectedSteps, source) {
        if (!USER_TRANSACTION_SOURCES.has(source)) {
            throw new TypeError("User Recipe transaction source is invalid");
        }
        const snapshot = this.#model.getSnapshot(),
            preparedModel = this.#model.prepareProjectedSteps(projectedSteps);
        return this.#commitPreparedModel(
            preparedModel,
            snapshot,
            RECIPE_TRANSACTION_ACTOR.USER,
            source
        );
    }


    /**
     * Commits a system-loaded Recipe projection with fixed attribution.
     *
     * @param {Object[]} projectedSteps - Complete visible Recipe projection.
     * @param {string} source - Trusted system mutation source.
     * @returns {Object} Immutable transaction result.
     */
    commitSystemProjection(projectedSteps, source) {
        if (!SYSTEM_TRANSACTION_SOURCES.has(source)) {
            throw new TypeError("System Recipe transaction source is invalid");
        }
        const snapshot = this.#model.getSnapshot(),
            preparedModel = this.#model.prepareProjectedSteps(projectedSteps);
        return this.#commitPreparedModel(
            preparedModel,
            snapshot,
            RECIPE_TRANSACTION_ACTOR.SYSTEM,
            source
        );
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
        const result = this.#publishPreparedModel(
            preparedModel,
            snapshot,
            RECIPE_TRANSACTION_ACTOR.AGENT,
            RECIPE_TRANSACTION_SOURCE.WEBMCP,
            patch.insertedSteps
        );
        if (result.status === RECIPE_TRANSACTION_STATUS.COMMITTED) {
            this.#nextStepNumber = draftStepNumber;
        }
        return result;
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
