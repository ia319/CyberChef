import {RecipeModel} from "./RecipeModel.mjs";
import {
    RecipePatchError,
    applyRecipePatch,
} from "./RecipePatch.mjs";

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
    REVERT: "revert",
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
    REVERT_STALE: "REVERT_STALE",
    REVERT_UNAVAILABLE: "REVERT_UNAVAILABLE",
});

const RECIPE_REVERT_REASON = Object.freeze({
    ALREADY_USED: "ALREADY_USED",
    NO_AGENT_CHANGE: "NO_AGENT_CHANGE",
    RECIPE_CHANGED: "RECIPE_CHANGED",
});

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
 * Owns synchronous Recipe validation, attribution, and publication.
 */
class RecipeTransaction {
    #model;
    #projectionAdapter;
    #nextStepNumber;
    #nextChangeNumber;
    #agentRevertSnapshot;
    #agentRevertReason;

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
        this.#agentRevertSnapshot = null;
        this.#agentRevertReason = RECIPE_REVERT_REASON.NO_AGENT_CHANGE;
    }


    /**
     * Commits a prepared Recipe model and creates its structured change.
     *
     * @param {Object} preparedModel - One-use prepared RecipeModel projection.
     * @param {Object} snapshot - Pre-change Recipe model snapshot.
     * @param {string} actor - Trusted transaction actor.
     * @param {string} source - Trusted transaction source.
     * @param {Object[]} [insertedSteps=[]] - Inserted command identities.
     * @param {Object[]} [actions=[]] - Bounded Recipe actions without argument values.
     * @returns {Object} Immutable transaction result.
     */
    #commitPreparedModel(preparedModel, snapshot, actor, source, insertedSteps=[], actions=[]) {
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
                actions: Object.freeze([...actions]),
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
     * @param {Object[]} [actions=[]] - Bounded Recipe actions without argument values.
     * @returns {Object} Immutable transaction result.
     */
    #publishPreparedModel(preparedModel, snapshot, actor, source, insertedSteps=[], actions=[]) {
        if (!preparedModel.changed) {
            return this.#commitPreparedModel(
                preparedModel,
                snapshot,
                actor,
                source,
                insertedSteps,
                actions
            );
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
                insertedSteps,
                actions
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
        const result = this.#commitPreparedModel(
            preparedModel,
            snapshot,
            RECIPE_TRANSACTION_ACTOR.USER,
            source
        );
        if (result.status === RECIPE_TRANSACTION_STATUS.COMMITTED) {
            this.#agentRevertSnapshot = null;
            this.#agentRevertReason = RECIPE_REVERT_REASON.RECIPE_CHANGED;
        }
        return result;
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
        const result = this.#commitPreparedModel(
            preparedModel,
            snapshot,
            RECIPE_TRANSACTION_ACTOR.SYSTEM,
            source
        );
        if (result.status === RECIPE_TRANSACTION_STATUS.COMMITTED) {
            this.#agentRevertSnapshot = null;
            this.#agentRevertReason = RECIPE_REVERT_REASON.RECIPE_CHANGED;
        }
        return result;
    }


    /**
     * Returns bounded availability for the latest Agent change snapshot.
     *
     * @returns {Object} Availability without Recipe content.
     */
    getAgentRevertState() {
        if (!this.#agentRevertSnapshot) {
            return Object.freeze({available: false, reason: this.#agentRevertReason});
        }
        if (this.#model.getSnapshot().recipeRevision !== this.#agentRevertSnapshot.afterRevision) {
            return Object.freeze({
                available: false,
                reason: RECIPE_REVERT_REASON.RECIPE_CHANGED,
            });
        }
        return Object.freeze({
            available: true,
            changeId: this.#agentRevertSnapshot.changeId,
            afterRevision: this.#agentRevertSnapshot.afterRevision,
        });
    }


    /**
     * Restores the Recipe before the latest Agent patch at its exact revision.
     *
     * @returns {Object} Immutable user-attributed transaction result.
     * @throws {RecipeTransactionError} When the snapshot is unavailable, stale, or cannot be projected.
     */
    revertAgentPatch() {
        const revertSnapshot = this.#agentRevertSnapshot;
        if (!revertSnapshot) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.REVERT_UNAVAILABLE);
        }

        const currentSnapshot = this.#model.getSnapshot();
        if (currentSnapshot.recipeRevision !== revertSnapshot.afterRevision) {
            this.#agentRevertSnapshot = null;
            this.#agentRevertReason = RECIPE_REVERT_REASON.RECIPE_CHANGED;
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.REVERT_STALE);
        }

        let preparedModel;
        try {
            preparedModel = this.#model.prepareProjectedSteps(revertSnapshot.steps);
        } catch (err) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.PROJECTION_FAILED);
        }
        const result = this.#publishPreparedModel(
            preparedModel,
            currentSnapshot,
            RECIPE_TRANSACTION_ACTOR.USER,
            RECIPE_TRANSACTION_SOURCE.REVERT
        );
        if (result.status === RECIPE_TRANSACTION_STATUS.COMMITTED) {
            this.#agentRevertSnapshot = null;
            this.#agentRevertReason = RECIPE_REVERT_REASON.ALREADY_USED;
        }
        return result;
    }


    /**
     * Applies one authorized Agent patch as a synchronous transaction.
     *
     * @param {Object} input - Detached patch request with an expected revision and changes.
     * @param {Object} policy - Synchronous Agent change preparation and authorization policy.
     * @returns {Object} Immutable transaction result without Recipe arguments.
     * @throws {RecipeTransactionError} When validation, policy, revision, or projection fails.
     */
    applyAgentPatch(input, policy) {
        if (!input || !Number.isSafeInteger(input.expectedRevision) ||
            !Array.isArray(input.changes) || !policy ||
            typeof policy.prepareChanges !== "function" ||
            typeof policy.authorizePatch !== "function") {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH);
        }

        const snapshot = this.#model.getSnapshot();
        if (input.expectedRevision !== snapshot.recipeRevision) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE);
        }

        const changes = policy.prepareChanges(input.changes),
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

        policy.authorizePatch(patch);

        if (this.#model.getSnapshot().recipeRevision !== input.expectedRevision) {
            throw new RecipeTransactionError(RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE);
        }

        const newStepIds = patch.insertedSteps.map(item => item.stepId),
            preparedModel = this.#model.prepareProjectedSteps(patch.steps, newStepIds);
        const result = this.#publishPreparedModel(
            preparedModel,
            snapshot,
            RECIPE_TRANSACTION_ACTOR.AGENT,
            RECIPE_TRANSACTION_SOURCE.WEBMCP,
            patch.insertedSteps,
            patch.actions
        );
        if (result.status === RECIPE_TRANSACTION_STATUS.COMMITTED) {
            this.#nextStepNumber = draftStepNumber;
            this.#agentRevertSnapshot = Object.freeze({
                changeId: result.change.changeId,
                beforeRevision: snapshot.recipeRevision,
                afterRevision: result.recipeRevision,
                steps: snapshot.steps,
            });
            this.#agentRevertReason = null;
        }
        return result;
    }
}

export {
    RECIPE_TRANSACTION_ACTOR,
    RECIPE_TRANSACTION_ERROR_CODE,
    RECIPE_TRANSACTION_SOURCE,
    RECIPE_TRANSACTION_STATUS,
    RECIPE_REVERT_REASON,
    RecipeTransaction,
    RecipeTransactionError,
};
