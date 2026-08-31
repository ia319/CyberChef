import assert from "assert";
import {RecipeModel} from "../../../src/web/recipe/RecipeModel.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const operation = (op, args=[], options={}) => ({op, args, ...options});
const projectedStep = (stepId, config) => ({stepId, operation: config});


TestRegister.addApiTests([
    it("RecipeModel: should keep duplicate Operation identities across moves and argument changes", () => {
        const model = new RecipeModel(),
            firstId = model.allocateStepId(),
            secondId = model.allocateStepId();

        assert.notEqual(firstId, secondId);
        assert.deepStrictEqual(model.commitProjectedSteps([
            projectedStep(firstId, operation("To Base64", ["A-Za-z0-9+/="])),
            projectedStep(secondId, operation("To Base64", ["A-Za-z0-9-_="])),
        ]), {changed: true, recipeRevision: 1});
        assert.deepStrictEqual(model.commitProjectedSteps([
            projectedStep(secondId, operation("To Base64", ["A-Za-z0-9-_="])),
            projectedStep(firstId, operation("To Base64", ["A-Za-z0-9+/="])),
        ]), {changed: true, recipeRevision: 2});
        assert.deepStrictEqual(model.commitProjectedSteps([
            projectedStep(secondId, operation("To Base64", ["A-Za-z0-9-_"])),
            projectedStep(firstId, operation("To Base64", ["A-Za-z0-9+/="])),
        ]), {changed: true, recipeRevision: 3});
        assert.deepStrictEqual(
            model.getSnapshot().steps.map(step => step.stepId),
            [secondId, firstId]
        );
    }),

    it("RecipeModel: should never reuse a deleted step ID", () => {
        const model = new RecipeModel(),
            deletedId = model.allocateStepId(),
            retainedId = model.allocateStepId();

        model.commitProjectedSteps([
            projectedStep(deletedId, operation("From Hex")),
            projectedStep(retainedId, operation("To Hex")),
        ]);
        model.commitProjectedSteps([
            projectedStep(retainedId, operation("To Hex")),
        ]);
        const insertedId = model.allocateStepId();
        model.commitProjectedSteps([
            projectedStep(retainedId, operation("To Hex")),
            projectedStep(insertedId, operation("From Hex")),
        ]);

        assert.notEqual(insertedId, deletedId);
        assert.equal(model.getSnapshot().steps.some(step => step.stepId === deletedId), false);
    }),

    it("RecipeModel: should advance revision once for each semantic commit", () => {
        const model = new RecipeModel(),
            stepId = model.allocateStepId(),
            initial = [projectedStep(stepId, operation("ROT13", [true, true, false, 13]))];

        assert.equal(model.getSnapshot().recipeRevision, 0);
        assert.deepStrictEqual(model.commitProjectedSteps(initial), {changed: true, recipeRevision: 1});
        assert.deepStrictEqual(model.commitProjectedSteps(initial), {changed: false, recipeRevision: 1});
        model.allocateStepId();
        assert.equal(model.getSnapshot().recipeRevision, 1);
        assert.deepStrictEqual(model.commitProjectedSteps([
            projectedStep(stepId, operation("ROT13", [true, true, false, 13], {breakpoint: true})),
        ]), {changed: true, recipeRevision: 2});
    }),

    it("RecipeModel: should redact arguments and Comment text from the read projection", () => {
        const model = new RecipeModel(),
            commentId = model.allocateStepId(),
            secretId = model.allocateStepId(),
            commentCanary = "SECRET_COMMENT_CANARY",
            argumentCanary = "SECRET_ARGUMENT_CANARY";

        model.commitProjectedSteps([
            projectedStep(commentId, operation("Comment", [commentCanary])),
            projectedStep(secretId, operation("To Base64", [argumentCanary], {
                disabled: true,
                breakpoint: true,
            })),
        ]);
        const projection = model.getReadProjection(),
            serialized = JSON.stringify(projection);

        assert.equal(serialized.includes(commentCanary), false);
        assert.equal(serialized.includes(argumentCanary), false);
        assert.equal(serialized.includes("args"), false);
        assert.deepStrictEqual(projection.steps[0].argumentStates, [{index: 0, configured: true}]);
        assert.equal(projection.steps[1].disabled, true);
        assert.equal(projection.steps[1].breakpoint, true);
        assert.equal(Object.isFrozen(projection), true);
        assert.equal(Object.isFrozen(projection.steps), true);
    }),

    it("RecipeModel: should export the existing Recipe format without runtime identity", () => {
        const model = new RecipeModel(),
            stepId = model.allocateStepId(),
            toggleArgument = {option: "Hex", string: "41"};

        model.commitProjectedSteps([
            projectedStep(stepId, operation("XOR", [toggleArgument, false], {
                disabled: true,
                breakpoint: true,
            })),
        ]);
        toggleArgument.string = "changed outside";
        const exported = model.exportConfig();

        assert.deepStrictEqual(exported, [{
            op: "XOR",
            args: [{option: "Hex", string: "41"}, false],
            disabled: true,
            breakpoint: true,
        }]);
        assert.equal(JSON.stringify(exported).includes(stepId), false);
        exported[0].args[0].string = "changed export";
        assert.equal(model.exportConfig()[0].args[0].string, "41");
    }),

    it("RecipeModel: should reject invalid and reused runtime identities", () => {
        let suppliedId = "step-a";
        const model = new RecipeModel(() => suppliedId),
            stepId = model.allocateStepId();

        assert.throws(() => model.allocateStepId(), RangeError);
        assert.throws(() => model.commitProjectedSteps([
            projectedStep(stepId, operation("To Hex")),
            projectedStep(stepId, operation("From Hex")),
        ]), RangeError);
        assert.throws(() => model.commitProjectedSteps([
            projectedStep("unallocated", operation("To Hex")),
        ]), TypeError);
        assert.throws(() => model.commitProjectedSteps([
            projectedStep(stepId, operation("To Hex", [() => true])),
        ]), TypeError);
        suppliedId = "contains spaces";
        assert.throws(() => model.allocateStepId(), TypeError);
    }),

    it("RecipeModel: should prepare a projection without changing current state", () => {
        const model = new RecipeModel(),
            existingId = model.allocateStepId();
        model.commitProjectedSteps([projectedStep(existingId, operation("From Hex"))]);

        const prepared = model.prepareProjectedSteps([
            projectedStep(existingId, operation("To Hex")),
            projectedStep("agent-step", operation("From Base64")),
        ], ["agent-step"]);

        assert.equal(prepared.expectedRevision, 1);
        assert.equal(prepared.recipeRevision, 2);
        assert.equal(prepared.changed, true);
        assert.deepStrictEqual(model.exportConfig(), [operation("From Hex")]);
        assert.equal(model.getSnapshot().recipeRevision, 1);

        assert.deepStrictEqual(model.commitPreparedProjection(prepared), {
            changed: true,
            recipeRevision: 2,
        });
        assert.deepStrictEqual(model.exportConfig(), [operation("To Hex"), operation("From Base64")]);
        assert.throws(() => model.commitPreparedProjection(prepared), TypeError);
        assert.deepStrictEqual(model.commitProjectedSteps([
            projectedStep(existingId, operation("To Hex")),
            projectedStep("agent-step", operation("From Base64")),
        ]), {changed: false, recipeRevision: 2});
    }),

    it("RecipeModel: should reject stale and invalid prepared projections", () => {
        const model = new RecipeModel(),
            stepId = model.allocateStepId();
        model.commitProjectedSteps([projectedStep(stepId, operation("From Hex"))]);

        const stale = model.prepareProjectedSteps([
            projectedStep(stepId, operation("To Hex")),
        ]);
        model.commitProjectedSteps([projectedStep(stepId, operation("From Base64"))]);

        assert.throws(() => model.commitPreparedProjection(stale), RangeError);
        assert.deepStrictEqual(model.exportConfig(), [operation("From Base64")]);
        assert.throws(() => model.commitPreparedProjection({}), TypeError);
        assert.throws(() => model.prepareProjectedSteps([
            projectedStep("missing", operation("To Hex")),
        ]), TypeError);
        assert.throws(() => model.prepareProjectedSteps([
            projectedStep("unused", operation("To Hex")),
        ], ["unused", "not-present"]), TypeError);
        assert.equal(model.getSnapshot().recipeRevision, 2);
    }),
]);
