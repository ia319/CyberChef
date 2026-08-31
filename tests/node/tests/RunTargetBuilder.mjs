import assert from "assert";
import {
    RUN_TARGET_ERROR_CODE,
    RUN_TARGET_SOURCE,
    RunTargetBuilder,
} from "../../../src/web/run/RunTargetBuilder.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


/**
 * Creates a valid workspace identity fixture.
 *
 * @param {Object} overrides - Fixture properties to replace.
 * @returns {Object} Workspace identity state.
 */
function createState(overrides={}) {
    return {
        source: RUN_TARGET_SOURCE.MANUAL,
        recipeRevisionAtStart: 4,
        inputStates: [{
            inputNum: 2,
            inputGeneration: "1:2",
            inputRevision: 3,
        }],
        outputStates: [{
            outputTabId: 2,
            outputGeneration: 7,
        }],
        activeInputTabId: 2,
        activeOutputTabId: 2,
        executionOptions: {wordWrap: true},
        viewVersion: 5,
        progress: 0,
        step: false,
        ...overrides,
    };
}


TestRegister.addApiTests([
    it("RunTargetBuilder: should capture an immutable active target", () => {
        const builder = new RunTargetBuilder(),
            captured = builder.capture(createState()),
            bound = builder.bindBakeId(captured, 9),
            active = builder.requireActiveTarget(bound);

        assert.equal(Object.isFrozen(active), true);
        assert.equal(Object.isFrozen(active.inputTargets), true);
        assert.equal(Object.isFrozen(active.inputTargets[0]), true);
        assert.deepStrictEqual(active, {
            source: RUN_TARGET_SOURCE.MANUAL,
            recipeRevisionAtStart: 4,
            inputTargets: [{
                inputTabId: 2,
                inputGeneration: "1:2",
                inputRevision: 3,
                outputTabId: 2,
                outputGeneration: 7,
            }],
            activeInputTabId: 2,
            activeOutputTabId: 2,
            tabsSynchronized: true,
            executionOptions: {},
            executionOptionsVersion: 0,
            viewVersion: 5,
            progress: 0,
            step: false,
            bakeId: 9,
        });
    }),

    it("RunTargetBuilder: should version only execution-affecting options", () => {
        const builder = new RunTargetBuilder(),
            initial = builder.capture(createState()),
            displayChange = builder.capture(createState({
                executionOptions: {wordWrap: false, theme: "dark"},
            })),
            executionChange = builder.capture(createState({
                executionOptions: {returnType: "string", wordWrap: false},
            })),
            sameExecution = builder.capture(createState({
                executionOptions: {returnType: "string", autoMagic: false},
            }));

        assert.equal(initial.executionOptionsVersion, 0);
        assert.equal(displayChange.executionOptionsVersion, 0);
        assert.equal(executionChange.executionOptionsVersion, 1);
        assert.equal(sameExecution.executionOptionsVersion, 1);
        assert.deepStrictEqual(executionChange.executionOptions, {returnType: "string"});
        assert.equal(builder.executionOptionsAreCurrent(initial, {returnType: "string"}), false);
        assert.equal(builder.executionOptionsAreCurrent(executionChange, {
            returnType: "string",
            wordWrap: true,
        }), true);
    }),

    it("RunTargetBuilder: should reject mismatched active tabs", () => {
        const builder = new RunTargetBuilder(),
            target = builder.capture(createState({activeOutputTabId: 3}));

        assert.equal(target.tabsSynchronized, false);
        assert.throws(() => builder.requireActiveTarget(target), error =>
            error.code === RUN_TARGET_ERROR_CODE.TAB_MISMATCH
        );
    }),

    it("RunTargetBuilder: should detect active view changes", () => {
        const builder = new RunTargetBuilder(),
            target = builder.capture(createState());

        assert.equal(builder.viewIsCurrent(target, {
            activeInputTabId: 2,
            activeOutputTabId: 2,
            tabsSynchronized: true,
            viewVersion: 5,
        }), true);
        assert.equal(builder.viewIsCurrent(target, {
            activeInputTabId: 3,
            activeOutputTabId: 3,
            tabsSynchronized: true,
            viewVersion: 6,
        }), false);
    }),

    it("RunTargetBuilder: should detect execution identity changes", () => {
        const builder = new RunTargetBuilder(),
            target = builder.capture(createState()),
            current = {
                recipeRevision: 4,
                inputStates: createState().inputStates,
                outputStates: createState().outputStates,
                executionOptions: {wordWrap: false},
            };

        assert.equal(builder.executionIsCurrent(target, current), true);
        [
            {recipeRevision: 5},
            {inputStates: [{...current.inputStates[0], inputRevision: 4}]},
            {inputStates: [{...current.inputStates[0], inputGeneration: "1:3"}]},
            {outputStates: [{...current.outputStates[0], outputGeneration: 8}]},
        ].forEach(change => {
            assert.equal(builder.executionIsCurrent(target, {...current, ...change}), false);
        });
    }),

    it("RunTargetBuilder: should reject missing and duplicate identities", () => {
        const builder = new RunTargetBuilder();

        assert.throws(() => builder.capture(createState({outputStates: []})), error =>
            error.code === RUN_TARGET_ERROR_CODE.TARGET_UNAVAILABLE
        );
        assert.throws(() => builder.capture(createState({
            inputStates: [
                createState().inputStates[0],
                createState().inputStates[0],
            ],
        })), error => error.code === RUN_TARGET_ERROR_CODE.INVALID_TARGET);
    }),
]);
