import assert from "assert";
import {
    RECIPE_PATCH_ERROR_CODE,
    RECIPE_PATCH_MAX_COMMANDS,
    RecipePatchError,
    applyRecipePatch,
} from "../../../src/web/recipe/RecipePatch.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const operation = (op, args=[], options={}) => ({op, args, ...options});
const step = (stepId, config) => ({stepId, operation: config});
const snapshot = steps => ({steps});


/**
 * Creates deterministic draft identifiers without changing a RecipeModel.
 *
 * @returns {Function} Sequential identifier source.
 */
function createStepIdSource() {
    let nextId = 0;
    return () => `draft-step-${++nextId}`;
}


/**
 * Checks a fixed Recipe patch error.
 *
 * @param {Function} callback - Expected failing operation.
 * @param {string} code - Expected error code.
 * @param {number|null} commandIndex - Expected command position.
 */
function assertPatchError(callback, code, commandIndex) {
    assert.throws(callback, err => err instanceof RecipePatchError &&
        err.code === code && err.commandIndex === commandIndex &&
        !err.message.includes("SECRET"));
}


TestRegister.addApiTests([
    it("RecipePatch: should apply all supported commands by stable step identity", () => {
        const initial = snapshot([
                step("duplicate-a", operation("To Base64", ["A-Za-z0-9+/="])),
                step("duplicate-b", operation("To Base64", ["A-Za-z0-9-_="])),
                step("hex", operation("From Hex", ["Auto"])),
            ]),
            result = applyRecipePatch(initial, [
                {type: "setArgument", stepId: "duplicate-b", argumentIndex: 0, value: "A-Za-z0-9-_"},
                {type: "disable", stepId: "duplicate-a"},
                {type: "enable", stepId: "duplicate-a"},
                {type: "setBreakpoint", stepId: "hex", enabled: true},
                {type: "move", stepId: "hex", beforeStepId: "duplicate-a"},
                {type: "remove", stepId: "duplicate-a"},
                {
                    type: "insert",
                    operation: "To Hex",
                    arguments: ["Space", 0],
                    afterStepId: "duplicate-b",
                },
            ], createStepIdSource());

        assert.deepStrictEqual(result.steps, [
            step("hex", operation("From Hex", ["Auto"], {breakpoint: true})),
            step("duplicate-b", operation("To Base64", ["A-Za-z0-9-_"])),
            step("draft-step-1", operation("To Hex", ["Space", 0])),
        ]);
        assert.deepStrictEqual(result.insertedSteps, [{commandIndex: 6, stepId: "draft-step-1"}]);
        assert.deepStrictEqual(initial.steps, [
            step("duplicate-a", operation("To Base64", ["A-Za-z0-9+/="])),
            step("duplicate-b", operation("To Base64", ["A-Za-z0-9-_="])),
            step("hex", operation("From Hex", ["Auto"])),
        ]);
        assert.equal(Object.isFrozen(result.steps), true);
        assert.equal(Object.isFrozen(result.steps[0].operation.args), true);
    }),

    it("RecipePatch: should insert at the beginning, after an anchor, and at the end", () => {
        const result = applyRecipePatch(snapshot([
            step("existing", operation("From Hex", ["Auto"])),
        ]), [
            {type: "insert", operation: "To Hex", arguments: ["None", 0], beforeStepId: "existing"},
            {type: "insert", operation: "To Base64", arguments: ["A-Za-z0-9+/="], afterStepId: "existing"},
            {type: "insert", operation: "From Base64", arguments: ["A-Za-z0-9+/=", true, false]},
        ], createStepIdSource());

        assert.deepStrictEqual(result.steps.map(item => item.stepId), [
            "draft-step-1",
            "existing",
            "draft-step-2",
            "draft-step-3",
        ]);
    }),

    it("RecipePatch: should reject a later command without changing the original snapshot", () => {
        const initial = snapshot([
                step("first", operation("From Hex", ["Auto"])),
                step("second", operation("To Hex", ["Space", 0])),
            ]),
            before = JSON.stringify(initial);

        assertPatchError(() => applyRecipePatch(initial, [
            {type: "disable", stepId: "first"},
            {type: "remove", stepId: "SECRET_MISSING_STEP"},
        ], createStepIdSource()), RECIPE_PATCH_ERROR_CODE.STEP_NOT_FOUND, 1);
        assert.equal(JSON.stringify(initial), before);
    }),

    it("RecipePatch: should reject invalid anchors and self-referential moves", () => {
        const initial = snapshot([
            step("first", operation("From Hex", ["Auto"])),
            step("second", operation("To Hex", ["Space", 0])),
        ]);

        assertPatchError(() => applyRecipePatch(initial, [{
            type: "move",
            stepId: "first",
            beforeStepId: "missing",
        }], createStepIdSource()), RECIPE_PATCH_ERROR_CODE.ANCHOR_NOT_FOUND, 0);
        assertPatchError(() => applyRecipePatch(initial, [{
            type: "move",
            stepId: "first",
            afterStepId: "first",
        }], createStepIdSource()), RECIPE_PATCH_ERROR_CODE.SAME_STEP_AND_ANCHOR, 0);
        assertPatchError(() => applyRecipePatch(initial, [{
            type: "insert",
            operation: "To Hex",
            arguments: ["None", 0],
            beforeStepId: "first",
            afterStepId: "second",
        }], createStepIdSource()), RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, 0);
    }),

    it("RecipePatch: should reject invalid commands and bounded values", () => {
        const initial = snapshot([step("first", operation("From Hex", ["Auto"]))]);

        assertPatchError(() => applyRecipePatch(initial, [{
            type: "setArgument",
            stepId: "first",
            argumentIndex: 1,
            value: "SECRET_ARGUMENT",
        }], createStepIdSource()), RECIPE_PATCH_ERROR_CODE.ARGUMENT_OUT_OF_RANGE, 0);
        assertPatchError(() => applyRecipePatch(initial, [{
            type: "remove",
            stepId: "first",
            extra: "SECRET_EXTRA",
        }], createStepIdSource()), RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, 0);
        assertPatchError(() => applyRecipePatch(initial, [{
            type: "insert",
            operation: "To Hex",
        }], createStepIdSource()), RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, 0);
        assertPatchError(() => applyRecipePatch(initial, new Array(RECIPE_PATCH_MAX_COMMANDS + 1).fill({
            type: "disable",
            stepId: "first",
        }), createStepIdSource()), RECIPE_PATCH_ERROR_CODE.INVALID_PATCH, null);
        assertPatchError(() => applyRecipePatch(initial, [{
            type: "__proto__",
            stepId: "first",
        }], createStepIdSource()), RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, 0);
    }),

    it("RecipePatch: should reject active and deleted draft identity reuse", () => {
        const initial = snapshot([step("duplicate", operation("From Hex", ["Auto"]))]);

        assertPatchError(() => applyRecipePatch(initial, [{
            type: "insert",
            operation: "To Hex",
            arguments: ["None", 0],
        }], () => "duplicate"), RECIPE_PATCH_ERROR_CODE.DUPLICATE_STEP_ID, 0);
        assertPatchError(() => applyRecipePatch(initial, [
            {type: "remove", stepId: "duplicate"},
            {type: "insert", operation: "To Hex", arguments: ["None", 0]},
        ], () => "duplicate"), RECIPE_PATCH_ERROR_CODE.DUPLICATE_STEP_ID, 1);
    }),
]);
