import assert from "assert";
import {RecipeModel} from "../../../src/web/recipe/RecipeModel.mjs";
import {
    RECIPE_TRANSACTION_ERROR_CODE,
    RECIPE_TRANSACTION_STATUS,
    RecipeTransaction,
    RecipeTransactionError,
} from "../../../src/web/recipe/RecipeTransaction.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const operation = (op, args=[], options={}) => ({op, args, ...options});
const projectedStep = (stepId, config) => ({stepId, operation: config});


/**
 * Creates a model with allocated identities and one committed Recipe.
 *
 * @param {Object[]} operations - Compatible Operation configurations.
 * @returns {{model: RecipeModel, stepIds: string[]}} Model and ordered identities.
 */
function createModel(operations) {
    const model = new RecipeModel(),
        stepIds = operations.map(() => model.allocateStepId());
    model.commitProjectedSteps(operations.map((config, index) => projectedStep(stepIds[index], config)));
    return {model, stepIds};
}


/**
 * Creates a reversible in-memory projection adapter.
 *
 * @param {Object[]} initialSteps - Initial visible projection.
 * @param {Object} [faults={}] - Projection fault injection flags.
 * @returns {Object} Adapter and visible projection accessor.
 */
function createProjectionAdapter(initialSteps, faults={}) {
    let visibleSteps = initialSteps;
    let prepareCount = 0;
    let publishCount = 0;
    let rollbackCount = 0;

    return {
        prepare(steps) {
            prepareCount++;
            if (faults.prepare) throw new Error("SECRET_PREPARE_FAILURE");
            const before = visibleSteps;
            return {
                publish() {
                    publishCount++;
                    visibleSteps = steps;
                    if (faults.publish) throw new Error("SECRET_PUBLISH_FAILURE");
                },
                rollback() {
                    rollbackCount++;
                    visibleSteps = before;
                },
            };
        },
        getState() {
            return {visibleSteps, prepareCount, publishCount, rollbackCount};
        },
    };
}


/**
 * Checks a fixed transaction failure without user-controlled error text.
 *
 * @param {Function} callback - Expected failing transaction.
 * @param {string} code - Expected transaction code.
 * @param {number|null} [commandIndex=null] - Expected command position.
 */
function assertTransactionError(callback, code, commandIndex=null) {
    assert.throws(callback, err => err instanceof RecipeTransactionError &&
        err.code === code && (commandIndex === null || err.commandIndex === commandIndex) &&
        !err.message.includes("SECRET"));
}


TestRegister.addApiTests([
    it("RecipeTransaction: should commit one Agent patch with trusted attribution", () => {
        const {model, stepIds} = createModel([
                operation("To Base64", ["A-Za-z0-9+/="]),
                operation("From Hex", ["Auto"]),
            ]),
            adapter = createProjectionAdapter(model.getSnapshot().steps),
            transaction = new RecipeTransaction(model, adapter),
            result = transaction.applyAgentPatch({
                expectedRevision: 1,
                changes: [
                    {type: "setArgument", stepId: stepIds[0], argumentIndex: 0, value: "A-Za-z0-9-_"},
                    {type: "move", stepId: stepIds[1], beforeStepId: stepIds[0]},
                    {type: "insert", operation: "To Hex", afterStepId: stepIds[0]},
                ],
            });

        assert.equal(result.status, RECIPE_TRANSACTION_STATUS.COMMITTED);
        assert.equal(result.recipeRevision, 2);
        assert.equal(result.change.actor, "agent");
        assert.equal(result.change.source, "webmcp");
        assert.equal(result.change.beforeRevision, 1);
        assert.equal(result.change.afterRevision, 2);
        assert.deepStrictEqual(result.insertedSteps, [{commandIndex: 2, stepId: "transaction-step-1"}]);
        assert.deepStrictEqual(model.exportConfig(), [
            operation("From Hex", ["Auto"]),
            operation("To Base64", ["A-Za-z0-9-_"]),
            operation("To Hex", ["Space", 0]),
        ]);
        assert.equal(adapter.getState().prepareCount, 1);
        assert.equal(adapter.getState().publishCount, 1);
        assert.equal(adapter.getState().rollbackCount, 0);
    }),

    it("RecipeTransaction: should reject stale and forged Agent inputs before projection", () => {
        const {model, stepIds} = createModel([operation("From Hex", ["Auto"])]),
            adapter = createProjectionAdapter(model.getSnapshot().steps),
            transaction = new RecipeTransaction(model, adapter);

        assertTransactionError(() => transaction.applyAgentPatch({
            expectedRevision: 0,
            changes: [{type: "disable", stepId: stepIds[0]}],
        }), RECIPE_TRANSACTION_ERROR_CODE.STALE_RECIPE);
        assertTransactionError(() => transaction.applyAgentPatch({
            expectedRevision: 1,
            changes: [{type: "disable", stepId: stepIds[0]}],
            actor: "user",
            source: "revert",
        }), RECIPE_TRANSACTION_ERROR_CODE.INVALID_PATCH);
        assert.equal(model.getSnapshot().recipeRevision, 1);
        assert.equal(adapter.getState().prepareCount, 0);
    }),

    it("RecipeTransaction: should enforce action policy on the complete post-change Recipe", () => {
        const {model, stepIds} = createModel([
                operation("Register", ["R0", "{0}"], {disabled: true}),
                operation("To Base64", ["A-Za-z0-9+/="]),
            ]),
            adapter = createProjectionAdapter(model.getSnapshot().steps),
            transaction = new RecipeTransaction(model, adapter);

        assertTransactionError(() => transaction.applyAgentPatch({
            expectedRevision: 1,
            changes: [{type: "enable", stepId: stepIds[0]}],
        }), RECIPE_TRANSACTION_ERROR_CODE.POLICY_BLOCKED, 0);
        assert.equal(model.getSnapshot().recipeRevision, 1);
        assert.equal(adapter.getState().prepareCount, 0);

        const result = transaction.applyAgentPatch({
            expectedRevision: 1,
            changes: [{type: "remove", stepId: stepIds[0]}],
        });
        assert.equal(result.status, RECIPE_TRANSACTION_STATUS.COMMITTED);
        assert.deepStrictEqual(model.exportConfig(), [operation("To Base64", ["A-Za-z0-9+/="])]);
    }),

    it("RecipeTransaction: should leave model and projection unchanged on preparation failure", () => {
        const {model} = createModel([operation("From Hex", ["Auto"])]),
            before = model.getSnapshot(),
            faults = {prepare: true},
            adapter = createProjectionAdapter(before.steps, faults),
            transaction = new RecipeTransaction(model, adapter);

        assertTransactionError(() => transaction.applyAgentPatch({
            expectedRevision: 1,
            changes: [{type: "insert", operation: "To Hex"}],
        }), RECIPE_TRANSACTION_ERROR_CODE.PROJECTION_FAILED);
        assert.equal(model.getSnapshot().recipeRevision, before.recipeRevision);
        assert.strictEqual(model.getSnapshot().steps, before.steps);
        assert.strictEqual(adapter.getState().visibleSteps, before.steps);
        assert.equal(adapter.getState().publishCount, 0);

        faults.prepare = false;
        const result = transaction.applyAgentPatch({
            expectedRevision: 1,
            changes: [{type: "insert", operation: "To Hex"}],
        });
        assert.deepStrictEqual(result.insertedSteps, [{commandIndex: 0, stepId: "transaction-step-1"}]);
    }),

    it("RecipeTransaction: should roll back a partial projection publication failure", () => {
        const {model, stepIds} = createModel([operation("From Hex", ["Auto"])]),
            before = model.getSnapshot(),
            adapter = createProjectionAdapter(before.steps, {publish: true}),
            transaction = new RecipeTransaction(model, adapter);

        assertTransactionError(() => transaction.applyAgentPatch({
            expectedRevision: 1,
            changes: [{type: "disable", stepId: stepIds[0]}],
        }), RECIPE_TRANSACTION_ERROR_CODE.PROJECTION_FAILED);
        assert.equal(model.getSnapshot().recipeRevision, before.recipeRevision);
        assert.strictEqual(model.getSnapshot().steps, before.steps);
        assert.strictEqual(adapter.getState().visibleSteps, before.steps);
        assert.equal(adapter.getState().rollbackCount, 1);
    }),

    it("RecipeTransaction: should skip projection for a semantic no-op", () => {
        const {model, stepIds} = createModel([
                operation("From Hex", ["Auto"], {disabled: true}),
            ]),
            adapter = createProjectionAdapter(model.getSnapshot().steps),
            transaction = new RecipeTransaction(model, adapter),
            result = transaction.applyAgentPatch({
                expectedRevision: 1,
                changes: [{type: "disable", stepId: stepIds[0]}],
            });

        assert.equal(result.status, RECIPE_TRANSACTION_STATUS.UNCHANGED);
        assert.equal(result.recipeRevision, 1);
        assert.equal(adapter.getState().prepareCount, 0);
    }),
]);
