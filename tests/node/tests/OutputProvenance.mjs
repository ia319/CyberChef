import assert from "assert";
import {
    createOutputProvenance,
    outputProvenanceMatchesTarget,
} from "../../../src/web/run/OutputProvenance.mjs";
import {RUN_FAILURE_KIND, RUN_STATE} from "../../../src/web/run/RunCoordinator.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


/**
 * Creates a bound Run target fixture.
 *
 * @param {Object} [overrides={}] - Target field overrides.
 * @returns {Object} Immutable target fixture.
 */
function createTarget(overrides={}) {
    return Object.freeze({
        bakeId: 7,
        recipeRevisionAtStart: 3,
        executionOptions: Object.freeze({returnType: "string"}),
        executionOptionsVersion: 2,
        inputTargets: Object.freeze([Object.freeze({
            inputTabId: 1,
            inputGeneration: "1:4",
            inputRevision: 5,
            outputTabId: 1,
            outputGeneration: 6,
        })]),
        ...overrides,
    });
}


TestRegister.addApiTests([
    it("OutputProvenance: should bind and settle a complete Output identity", () => {
        const target = createTarget(),
            pending = createOutputProvenance(target, 1, 8),
            completed = createOutputProvenance(target, 1, 9, {
                state: RUN_STATE.COMPLETED,
                presenter: "To Base64",
                progress: 1,
            });

        assert.equal(Object.isFrozen(pending), true);
        assert.equal(pending.terminalState, null);
        assert.equal(pending.outputVersion, 8);
        assert.equal(outputProvenanceMatchesTarget(pending, target, 1), true);
        assert.deepStrictEqual(completed, {
            bakeId: 7,
            recipeRevision: 3,
            inputTabId: 1,
            inputGeneration: "1:4",
            inputRevision: 5,
            outputTabId: 1,
            outputGeneration: 6,
            outputVersion: 9,
            executionOptions: {returnType: "string"},
            executionOptionsVersion: 2,
            terminalState: RUN_STATE.COMPLETED,
            failureKind: null,
            presenter: "To Base64",
            progress: 1,
        });
    }),

    it("OutputProvenance: should reject stale targets and invalid terminal states", () => {
        const target = createTarget(),
            failed = createOutputProvenance(target, 1, 10, {
                state: RUN_STATE.FAILED,
                failureKind: RUN_FAILURE_KIND.EXPECTED,
            });

        assert.equal(failed.failureKind, RUN_FAILURE_KIND.EXPECTED);
        assert.equal(outputProvenanceMatchesTarget(failed, createTarget({bakeId: 8}), 1), false);
        assert.equal(outputProvenanceMatchesTarget(failed, createTarget({
            inputTargets: Object.freeze([Object.freeze({
                ...target.inputTargets[0],
                inputRevision: 6,
            })]),
        }), 1), false);
        assert.throws(
            () => createOutputProvenance(target, 1, 11, {state: RUN_STATE.RUNNING}),
            /Output provenance is invalid/
        );
        assert.throws(
            () => createOutputProvenance(target, 1, 11, {
                state: RUN_STATE.PAUSED,
                progress: -1,
            }),
            /Output provenance is invalid/
        );
    }),
]);
