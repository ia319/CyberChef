import assert from "assert";
import {RUN_DECISION, RUN_STATE} from "../../../src/web/run/RunCoordinator.mjs";
import {RunTargetBuilder} from "../../../src/web/run/RunTargetBuilder.mjs";
import {
    AGENT_BAKE_ERROR_CODE,
    AgentBakeError,
} from "../../../src/web/webmcp/AgentBakeError.mjs";
import {AgentBakeService} from "../../../src/web/webmcp/AgentBakeService.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


/**
 * Creates a deterministic application fixture around the Agent Bake service.
 *
 * @param {Object} [options={}] - Recipe and Run outcome overrides.
 * @returns {Object} Service, state, and Worker evidence.
 */
function createFixture(options={}) {
    const inputState = Object.freeze({
            inputNum: 1,
            inputGeneration: "1:1",
            inputRevision: 2,
            inputByteLength: options.inputByteLength ?? 12,
        }),
        outputState = Object.freeze({
            outputTabId: 1,
            outputGeneration: 3,
            outputVersion: 0,
        }),
        viewState = Object.freeze({
            activeInputTabId: 1,
            activeOutputTabId: 1,
            tabsSynchronized: true,
            viewVersion: 4,
        }),
        recipeConfig = options.recipeConfig ?? [
            {op: "To Base64", args: ["A-Za-z0-9+/="]},
            {op: "To Hex", args: ["Space", 0]},
        ],
        projection = {
            recipeRevision: 7,
            steps: [
                {stepId: "recipe-step-1"},
                {stepId: "recipe-step-2"},
            ],
        },
        terminalState = options.terminalState ?? RUN_STATE.COMPLETED,
        progress = options.progress === undefined ? 2 : options.progress,
        decision = options.decision ?? RUN_DECISION.STARTED,
        evidence = {
            flushCount: 0,
            workerCount: 0,
            target: null,
            signal: null,
            provenance: null,
        },
        app = {options: {}},
        manager = {
            recipe: {
                getRecipeRevision: () => options.recipeRevision ?? 7,
                getConfig: () => recipeConfig,
                getReadProjection: () => projection,
            },
            input: {
                flushActiveInputForBake: async () => {
                    evidence.flushCount++;
                    return inputState;
                },
                getSynchronizedInputState: () => options.inputSynchronized === false ?
                    null : inputState,
            },
            output: {
                getOutputState: () => Object.freeze({
                    ...outputState,
                    outputVersion: options.currentOutputVersion ??
                        evidence.provenance?.outputVersion ?? outputState.outputVersion,
                }),
                getOutputProvenance: () => evidence.provenance,
                outputIsFresh: () => options.outputFresh ?? true,
            },
            tabs: {
                getViewState: () => options.viewState ?? viewState,
            },
            runTargets: new RunTargetBuilder(),
            worker: null,
        };

    manager.worker = {
        getCurrentExecutionState: target => ({
            recipeRevision: options.currentRecipeRevision ?? 7,
            inputStates: [inputState],
            outputStates: [outputState],
            executionOptions: app.options,
            target,
        }),
        bakeAgentTarget: (target, signal) => {
            evidence.workerCount++;
            evidence.target = target;
            evidence.signal = signal;
            if (decision === RUN_DECISION.BUSY) {
                return {decision, run: {bakeId: 10}, completion: null};
            }

            const bakeId = 11,
                boundTarget = Object.freeze({...target, bakeId}),
                inputOutcome = Object.freeze({
                    inputTabId: 1,
                    outputTabId: 1,
                    state: terminalState,
                    failureKind: terminalState === RUN_STATE.FAILED ? "expected" : null,
                    presenter: null,
                    progress,
                });
            evidence.provenance = Object.freeze({
                bakeId,
                recipeRevision: 7,
                inputTabId: 1,
                inputGeneration: "1:1",
                inputRevision: 2,
                outputTabId: 1,
                outputGeneration: 3,
                outputVersion: 5,
                executionOptions: {},
                executionOptionsVersion: target.executionOptionsVersion,
                terminalState,
                failureKind: inputOutcome.failureKind,
                presenter: null,
                progress,
            });
            if (options.mutateProvenance) {
                evidence.provenance = Object.freeze(options.mutateProvenance(evidence.provenance));
            }
            return {
                decision,
                run: {bakeId, target: boundTarget},
                completion: Promise.resolve(Object.freeze({
                    bakeId,
                    target: boundTarget,
                    terminalState,
                    inputs: Object.freeze([inputOutcome]),
                })),
            };
        },
    };

    return {
        service: new AgentBakeService(app, manager),
        evidence,
    };
}


TestRegister.addApiTests([
    it("WebMCPAgentBakeService: should expose only available active state", () => {
        const {service} = createFixture(),
            state = service.getActiveState(7);
        assert.deepStrictEqual(state, {
            executionCapability: "AGENT_BAKE_AVAILABLE",
            inputTabId: 1,
            inputGeneration: "1:1",
            inputRevision: 2,
            executionOptionsVersion: 0,
            viewVersion: 4,
            outputTabId: 1,
            outputGeneration: 3,
            outputVersion: 0,
            bakeId: null,
            terminalState: null,
        });

        const pending = createFixture({inputSynchronized: false});
        assert.deepStrictEqual(pending.service.getActiveState(7), {
            executionCapability: "AGENT_BAKE_AVAILABLE",
        });
    }),

    it("WebMCPAgentBakeService: should reuse, join, and start exact active targets", async () => {
        for (const decision of [
            RUN_DECISION.ALREADY_FRESH,
            RUN_DECISION.JOINED,
            RUN_DECISION.STARTED,
        ]) {
            const {service, evidence} = createFixture({decision}),
                controller = new AbortController(),
                result = await service.ensureActiveBake(7, controller.signal);

            assert.equal(result.decision, decision);
            assert.equal(result.terminalState, RUN_STATE.COMPLETED);
            assert.equal(result.progress, 2);
            assert.equal(result.stepId, null);
            assert.equal(result.target.inputTargets.length, 1);
            assert.equal(result.target.inputTargets[0].inputTabId, 1);
            assert.equal(result.target.bakeId, 11);
            assert.equal(result.provenance.outputVersion, 5);
            assert.strictEqual(evidence.signal, controller.signal);
            assert.equal(evidence.flushCount, 1);
            assert.equal(evidence.workerCount, 1);
        }
    }),

    it("WebMCPAgentBakeService: should report the stable failed or paused step", async () => {
        for (const terminalState of [RUN_STATE.FAILED, RUN_STATE.PAUSED]) {
            const {service} = createFixture({terminalState, progress: 1}),
                result = await service.ensureActiveBake(7);
            assert.equal(result.terminalState, terminalState);
            assert.equal(result.stepId, "recipe-step-2");
        }
    }),

    it("WebMCPAgentBakeService: should reject a busy visible Run without retrying", async () => {
        const {service, evidence} = createFixture({decision: RUN_DECISION.BUSY});
        await assert.rejects(service.ensureActiveBake(7), error =>
            error instanceof AgentBakeError && error.code === AGENT_BAKE_ERROR_CODE.BAKE_BUSY
        );
        assert.equal(evidence.workerCount, 1);
    }),

    it("WebMCPAgentBakeService: should stop blocked Recipes before Worker execution", async () => {
        const cases = [
            [{op: "HTTP request", args: []}, AGENT_BAKE_ERROR_CODE.RISK_BLOCKED],
            [{op: "To Hex", args: ["SECRET_DELIMITER", 0]}, AGENT_BAKE_ERROR_CODE.RISK_BLOCKED],
            [{op: "Unzip", args: []}, AGENT_BAKE_ERROR_CODE.UNREVIEWED_OPERATION],
        ];
        for (const [operation, expectedCode] of cases) {
            const {service, evidence} = createFixture({recipeConfig: [operation]});
            await assert.rejects(service.ensureActiveBake(7), error =>
                error instanceof AgentBakeError && error.code === expectedCode
            );
            assert.equal(evidence.workerCount, 0);
        }
    }),

    it("WebMCPAgentBakeService: should reject stale revisions and mismatched tabs", async () => {
        const stale = createFixture({recipeRevision: 8});
        await assert.rejects(stale.service.ensureActiveBake(7), error =>
            error.code === AGENT_BAKE_ERROR_CODE.STALE_RECIPE
        );
        assert.equal(stale.evidence.flushCount, 0);

        const mismatch = createFixture({
            viewState: {
                activeInputTabId: 1,
                activeOutputTabId: 2,
                tabsSynchronized: false,
                viewVersion: 5,
            },
        });
        await assert.rejects(mismatch.service.ensureActiveBake(7), error =>
            error.code === AGENT_BAKE_ERROR_CODE.TAB_MISMATCH
        );
        assert.equal(mismatch.evidence.workerCount, 0);
    }),

    it("WebMCPAgentBakeService: should reject stale Output provenance", async () => {
        const {service} = createFixture({currentOutputVersion: 6});
        await assert.rejects(service.ensureActiveBake(7), error =>
            error instanceof AgentBakeError &&
                error.code === AGENT_BAKE_ERROR_CODE.STALE_BAKE_RESULT
        );
    }),

    it("WebMCPAgentBakeService: should return cancellation without restarting", async () => {
        const {service, evidence} = createFixture({
                terminalState: RUN_STATE.CANCELLED,
                progress: null,
            }),
            result = await service.ensureActiveBake(7);

        assert.equal(result.terminalState, RUN_STATE.CANCELLED);
        assert.equal(evidence.workerCount, 1);
    }),
]);
