/**
 * @author n1474335 [n1474335@gmail.com]
 * @author j433866 [j433866@gmail.com]
 * @copyright Crown Copyright 2019
 * @license Apache-2.0
 */

import ChefWorker from "worker-loader?inline=no-fallback!../../core/ChefWorker.js";
import DishWorker from "worker-loader?inline=no-fallback!../workers/DishWorker.mjs";
import { debounce } from "../../core/Utils.mjs";
import {
    WORKER_ACTION,
    WORKER_ACTION_SCOPE,
    getWorkerActionPolicy,
} from "../run/WorkerActionPolicy.mjs";
import {
    RUN_TARGET_ERROR_CODE,
    RunTargetError,
} from "../run/RunTargetBuilder.mjs";
import {
    RUN_DECISION,
    RUN_FAILURE_KIND,
    RUN_MODE,
    RUN_STATE,
    getRunOwner,
} from "../run/RunCoordinator.mjs";
import {getRunOutcome} from "../run/RunOutcome.mjs";

const MAX_PENDING_HIGHLIGHT_REQUESTS = 64;

/**
 * Waiter to handle conversations with the ChefWorker
 */
class WorkerWaiter {

    /**
     * WorkerWaiter constructor
     *
     * @param {App} app - The main view object for CyberChef
     * @param {Manager} manager - The CyberChef event manager
     */
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;

        this.loaded = false;
        this.chefWorkers = [];
        this.inputs = [];
        this.inputNums = [];
        this.totalOutputs = 0;
        this.loadingOutputs = 0;
        this.bakeId = 0;
        this.bakeTarget = null;
        this.dishCallbacks = new Map();
        this.callbackID = 0;
        this.highlightRequests = new Map();
        this.highlightID = 0;
        this.silentBakeID = 0;

        this.maxWorkers = 1;
        if (navigator.hardwareConcurrency !== undefined &&
            navigator.hardwareConcurrency > 1) {
            this.maxWorkers = navigator.hardwareConcurrency - 1;
        }

        // Store dishWorker action (getDishAs or getDishTitle)
        this.dishWorker = {
            worker: null,
            currentAction: "",
            currentRequestId: null,
        };
        this.dishWorkerQueue = [];
    }

    /**
     * Terminates any existing ChefWorkers and sets up a new worker
     */
    setupChefWorker() {
        for (let i = this.chefWorkers.length - 1; i >= 0; i--) {
            this.removeChefWorker(this.chefWorkers[i]);
        }

        this.addChefWorker();
        this.setupDishWorker();
    }

    /**
     * Sets up a DishWorker to be used for performing Dish operations
     */
    setupDishWorker() {
        if (this.dishWorker.worker !== null) {
            this.dishWorker.worker.terminate();
            this.dishWorker.currentAction = "";
            this.dishWorker.currentRequestId = null;
        }
        log.debug("Adding new DishWorker");

        this.dishWorker.worker = new DishWorker();
        this.dishWorker.worker.addEventListener("message", this.handleDishMessage.bind(this));
        this.dishWorker.worker.postMessage({
            action: "setLogLevel",
            data: log.getLevel()
        });

        if (this.dishWorkerQueue.length > 0) {
            this.postDishMessage(this.dishWorkerQueue.splice(0, 1)[0]);
        }
    }

    /**
     * Adds a new ChefWorker
     *
     * @returns {number} The index of the created worker
     */
    addChefWorker() {
        if (this.chefWorkers.length === this.maxWorkers) {
            // Can't create any more workers
            return -1;
        }

        log.debug(`Adding new ChefWorker (${this.chefWorkers.length + 1}/${this.maxWorkers})`);

        // Create a new ChefWorker and send it the docURL
        const newWorker = new ChefWorker(),
            newWorkerObj = {
                worker: newWorker,
                active: false,
                inputNum: -1,
                loaded: false,
                runTarget: null,
                silentTarget: null,
            };
        newWorker.addEventListener("message", event => this.handleChefMessage(event, newWorkerObj));
        newWorker.addEventListener("error", () =>
            this.handleChefWorkerFailure(newWorkerObj, RUN_FAILURE_KIND.WORKER)
        );
        newWorker.addEventListener("messageerror", () =>
            this.handleChefWorkerFailure(newWorkerObj, RUN_FAILURE_KIND.MESSAGE)
        );
        newWorker.postMessage({
            action: "setLogPrefix",
            data: "ChefWorker"
        });
        newWorker.postMessage({
            action: "setLogLevel",
            data: log.getLevel()
        });

        let docURL = document.location.href.split(/[#?]/)[0];
        const index = docURL.lastIndexOf("/");
        if (index > 0) {
            docURL = docURL.substring(0, index);
        }
        newWorker.postMessage({"action": "docURL", "data": docURL});


        this.chefWorkers.push(newWorkerObj);
        return this.chefWorkers.indexOf(newWorkerObj);
    }

    /**
     * Gets an inactive ChefWorker to be used for baking
     *
     * @param {boolean} [setActive=true] - If true, set the worker status to active
     * @returns {number} - The index of the ChefWorker
     */
    getInactiveChefWorker(setActive=true) {
        for (let i = 0; i < this.chefWorkers.length; i++) {
            if (!this.chefWorkers[i].active) {
                this.chefWorkers[i].active = setActive;
                return i;
            }
        }
        return -1;
    }

    /**
     * Removes a ChefWorker
     *
     * @param {Object} workerObj
     */
    removeChefWorker(workerObj) {
        const index = this.chefWorkers.indexOf(workerObj);
        if (index === -1) {
            return;
        }

        if (this.chefWorkers.length > 1 || this.chefWorkers[index].active) {
            log.debug(`Removing ChefWorker at index ${index}`);
            this.chefWorkers[index].worker.terminate();
            for (const [highlightId, request] of this.highlightRequests) {
                if (request.workerObj === this.chefWorkers[index]) {
                    this.highlightRequests.delete(highlightId);
                }
            }
            this.chefWorkers.splice(index, 1);
        }

        // There should always be a ChefWorker loaded
        if (this.chefWorkers.length === 0) {
            this.addChefWorker();
        }
    }

    /**
     * Closes the task owned by a Worker after an unstructured browser failure.
     *
     * @param {Object} workerObj - Trusted Worker state.
     * @param {string} failureKind - Fixed Worker failure classification.
     * @returns {void}
     */
    handleChefWorkerFailure(workerObj, failureKind) {
        if (this.chefWorkers.indexOf(workerObj) === -1) return;

        if (workerObj.runTarget) {
            const target = workerObj.runTarget,
                inputNum = target.inputTargets[0].inputTabId;
            if (!this.isCurrentBakeTarget(target)) {
                this.settleStaleWorker(workerObj);
                return;
            }

            this.manager.output.updateOutputBakeTarget(
                target.bakeId,
                target.recipeRevisionAtStart,
                inputNum
            );
            this.manager.output.updateOutputError("Worker execution failed.", inputNum, 0);
            this.manager.runs.settleInput(target.bakeId, inputNum, {
                state: RUN_STATE.FAILED,
                failureKind,
            });
            this.removeChefWorker(workerObj);

            if (this.inputs.length > 0 && this.manager.runs.isActive(target.bakeId)) {
                this.bakeNextInput(this.getInactiveChefWorker(true));
            } else if (this.inputNums.length === 0 && this.loadingOutputs === 0 &&
                !this.manager.runs.isActive(target.bakeId)) {
                this.bakingComplete();
            }
            return;
        }

        if (workerObj.silentTarget) {
            this.manager.runs.settle(
                workerObj.silentTarget.bakeId,
                RUN_STATE.FAILED,
                failureKind
            );
        }
        workerObj.active = true;
        this.removeChefWorker(workerObj);
    }

    /**
     * Stops application work after the coordinator closes or abandons a Run.
     *
     * @param {Object} run - Immutable coordinator snapshot.
     * @returns {void}
     */
    terminateCoordinatedRun(run) {
        if (!run) return;
        if (this.bakeTarget?.bakeId === run.bakeId) {
            const terminalState = run.terminalState ?? RUN_STATE.CANCELLED;
            this.cancelBake(true, false, terminalState);
            return;
        }

        const workerObj = this.chefWorkers.find(worker =>
            worker.silentTarget?.bakeId === run.bakeId
        );
        if (!workerObj) return;
        if (this.manager.runs.isActive(run.bakeId)) {
            this.manager.runs.settle(run.bakeId, RUN_STATE.CANCELLED);
        }
        this.removeChefWorker(workerObj);
    }

    /**
     * Captures the identities and execution settings for an InputWorker Bake request.
     *
     * @param {Object} inputData - Content-free InputWorker Bake request.
     * @returns {Object} Immutable workspace target.
     * @throws {RunTargetError} When the request no longer identifies a complete workspace target.
     */
    captureWorkspaceTarget(inputData) {
        if (!Array.isArray(inputData?.nums) || !Array.isArray(inputData?.inputStates) ||
            inputData.nums.length < 1 || inputData.nums.length !== inputData.inputStates.length ||
            inputData.nums.some((inputNum, index) =>
                inputNum !== inputData.inputStates[index]?.inputNum
            )) {
            throw new RunTargetError(
                RUN_TARGET_ERROR_CODE.INVALID_TARGET,
                "Input target list is invalid"
            );
        }

        const outputStates = inputData.nums.map(inputNum =>
            this.manager.output.getOutputState(inputNum)
        );
        if (outputStates.some(outputState => outputState === null)) {
            throw new RunTargetError(
                RUN_TARGET_ERROR_CODE.TARGET_UNAVAILABLE,
                "A matching Output target is unavailable"
            );
        }

        return this.manager.runTargets.capture({
            source: inputData.source,
            recipeRevisionAtStart: this.manager.recipe.getRecipeRevision(),
            inputStates: inputData.inputStates,
            outputStates,
            ...this.manager.tabs.getViewState(),
            executionOptions: this.app.options,
            progress: inputData.progress,
            step: inputData.step,
        });
    }

    /**
     * Reads the content-free identities needed to validate a captured target.
     *
     * @param {Object} target - Captured or bound workspace target.
     * @returns {Object} Current execution identity state.
     */
    getCurrentExecutionState(target) {
        return {
            recipeRevision: this.manager.recipe.getRecipeRevision(),
            inputStates: target.inputTargets.map(inputTarget =>
                this.manager.input.getSynchronizedInputState(inputTarget.inputTabId)
            ),
            outputStates: target.inputTargets.map(inputTarget =>
                this.manager.output.getOutputState(inputTarget.outputTabId)
            ),
            executionOptions: this.app.options,
        };
    }

    /**
     * Checks whether one Bake target still belongs to the current workspace execution state.
     *
     * @param {Object|null} target - Captured Bake target.
     * @returns {boolean} Whether the target is current.
     */
    isCurrentBakeTarget(target) {
        return !!target && !!this.bakeTarget &&
            target.bakeId === this.bakeTarget.bakeId &&
            this.manager.runs.isActive(target.bakeId) &&
            this.manager.runTargets.executionIsCurrent(
                target,
                this.getCurrentExecutionState(target)
            );
    }

    /**
     * Checks whether a Run message belongs to the task assigned to its Worker.
     *
     * @param {Object} data - Worker message data.
     * @param {Object} workerObj - Source Worker state.
     * @returns {boolean} Whether the message matches the assigned task.
     */
    matchesWorkerRun(data, workerObj) {
        const target = workerObj?.runTarget,
            inputTarget = target?.inputTargets?.[0];
        return !!target && data?.bakeId === target.bakeId &&
            data?.recipeRevisionAtStart === target.recipeRevisionAtStart &&
            data?.inputNum === inputTarget?.inputTabId;
    }

    /**
     * Checks whether an InputWorker response matches its captured Input identity.
     *
     * @param {Object} inputData - InputWorker queue response.
     * @returns {boolean} Whether the response belongs to the captured target.
     */
    matchesQueuedInput(inputData) {
        const inputTarget = this.manager.runTargets.getInputTarget(
            this.bakeTarget,
            inputData?.inputNum
        );
        return !!inputTarget &&
            inputData.inputGeneration === inputTarget.inputGeneration &&
            inputData.inputRevision === inputTarget.inputRevision;
    }

    /**
     * Requests one captured Input from the InputWorker for the current Bake.
     *
     * @param {number} inputNum - Captured Input number.
     * @returns {void}
     * @throws {RunTargetError} When the Input is absent from the current Bake target.
     */
    requestInputForBake(inputNum) {
        const inputTarget = this.manager.runTargets.getInputTarget(this.bakeTarget, inputNum);
        if (!inputTarget) {
            throw new RunTargetError(
                RUN_TARGET_ERROR_CODE.TARGET_UNAVAILABLE,
                "The requested Input target is unavailable"
            );
        }
        this.manager.input.inputWorker.postMessage({
            action: "bakeNext",
            data: {
                inputNum,
                inputGeneration: inputTarget.inputGeneration,
                inputRevision: inputTarget.inputRevision,
                bakeId: this.bakeTarget.bakeId,
                recipeRevisionAtStart: this.bakeTarget.recipeRevisionAtStart,
            }
        });
        this.loadingOutputs++;
    }

    /**
     * Drops work that has not reached a ChefWorker after its Recipe becomes stale.
     */
    dropStaleBakeQueue() {
        this.inputs = [];
        this.inputNums = [];
    }

    /**
     * Completes stale Bake lifecycle after every dispatched request settles.
     */
    completeStaleBakeIfIdle() {
        if (this.loadingOutputs > 0 || this.chefWorkers.some(worker => worker.active && worker.runTarget)) {
            return;
        }
        this.setBakingStatus(false);
        this.totalOutputs = 0;
        if (this.bakeTarget) {
            this.manager.runs.settle(this.bakeTarget.bakeId, RUN_STATE.SUPERSEDED);
        }
        this.manager.output.markRunTargetStale(this.bakeTarget);
        this.bakeTarget = null;
        document.getElementById("bake").style.background = "";
    }

    /**
     * Settles a terminal stale response without applying its page effects.
     *
     * @param {Object} workerObj - Source Worker state.
     */
    settleStaleWorker(workerObj) {
        if (!workerObj.runTarget || workerObj.runTarget.bakeId !== this.bakeTarget?.bakeId) return;
        this.cancelBake(true, false, RUN_STATE.SUPERSEDED);
    }

    /**
     * Handles ChefWorker messages within their assigned identity scope.
     *
     * @param {MessageEvent} e - Worker message.
     * @param {Object} workerObj - Trusted source Worker state.
     */
    handleChefMessage(e, workerObj) {
        const r = e.data,
            policy = getWorkerActionPolicy(r?.action);
        log.debug(`Receiving '${r?.action}' from ChefWorker.`);

        if (!policy) {
            log.error("Unrecognised message from ChefWorker");
            return;
        }

        if (policy.scope === WORKER_ACTION_SCOPE.LIFECYCLE) {
            if (workerObj.loaded) return;
            workerObj.loaded = true;
            this.app.workerLoaded = true;
            log.debug("ChefWorker loaded");
            if (!this.loaded) {
                this.app.loaded();
                this.loaded = true;
            } else if (!workerObj.active && this.inputs.length > 0) {
                if (this.isCurrentBakeTarget(this.bakeTarget)) {
                    this.bakeNextInput(this.chefWorkers.indexOf(workerObj));
                } else {
                    this.dropStaleBakeQueue();
                    this.completeStaleBakeIfIdle();
                }
            }
            return;
        }

        if (policy.scope === WORKER_ACTION_SCOPE.HIGHLIGHT) {
            const request = this.highlightRequests.get(r.data?.highlightId);
            if (!request || request.workerObj !== workerObj) return;
            this.highlightRequests.delete(r.data.highlightId);
            if (r.data.recipeRevisionAtStart !== request.recipeRevisionAtStart ||
                request.recipeRevisionAtStart !== this.manager.recipe.getRecipeRevision()) return;
            this.manager.highlighter.displayHighlights(r.data.pos, r.data.direction);
            return;
        }

        if (policy.scope === WORKER_ACTION_SCOPE.REQUEST) {
            // ChefWorker request conversions are not used by the page and have no registered identity.
            return;
        }

        if (policy.scope === WORKER_ACTION_SCOPE.SILENT_RUN) {
            const target = workerObj.silentTarget;
            if (!target || r.data?.silentBakeId !== target.silentBakeId ||
                r.data?.bakeId !== target.bakeId ||
                r.data?.recipeRevisionAtStart !== target.recipeRevisionAtStart ||
                !this.manager.runs.isActive(target.bakeId)) return;
            this.manager.runs.settle(target.bakeId, RUN_STATE.COMPLETED);
            workerObj.active = false;
            workerObj.silentTarget = null;
            if (this.inputs.length > 0 && this.isCurrentBakeTarget(this.bakeTarget)) {
                this.bakeNextInput(this.chefWorkers.indexOf(workerObj));
            } else if (this.inputs.length > 0) {
                this.dropStaleBakeQueue();
                this.completeStaleBakeIfIdle();
            }
            return;
        }

        if (!this.matchesWorkerRun(r.data, workerObj)) return;
        if (!this.isCurrentBakeTarget(workerObj.runTarget)) {
            if (policy.terminal) this.settleStaleWorker(workerObj);
            return;
        }

        const inputNum = r.data.inputNum;
        switch (r.action) {
            case WORKER_ACTION.BAKE_COMPLETE: {
                const outcome = getRunOutcome(r.data);
                log.debug(`Bake ${inputNum} complete.`);
                this.manager.timing.recordTime("bakeComplete", inputNum);
                this.manager.timing.recordTime("bakeDuration", inputNum, r.data.duration);

                if (r.data.error) {
                    this.app.handleError(r.data.error);
                    this.manager.output.updateOutputBakeTarget(
                        r.data.bakeId,
                        r.data.recipeRevisionAtStart,
                        inputNum
                    );
                    this.manager.output.updateOutputError(r.data.error, inputNum, r.data.progress);
                } else {
                    this.updateOutput(
                        r.data,
                        inputNum,
                        r.data.bakeId,
                        r.data.recipeRevisionAtStart,
                        r.data.progress
                    );
                }

                this.app.progress = r.data.progress;
                if (outcome.state === RUN_STATE.COMPLETED) this.step = false;
                this.manager.runs.settleInput(r.data.bakeId, inputNum, outcome);
                this.workerFinished(workerObj);
                break;
            }
            case WORKER_ACTION.BAKE_ERROR:
                this.app.handleError(r.data.error);
                this.manager.output.updateOutputBakeTarget(
                    r.data.bakeId,
                    r.data.recipeRevisionAtStart,
                    inputNum
                );
                this.manager.output.updateOutputError(r.data.error, inputNum, r.data.progress ?? 0);
                this.app.progress = r.data.progress ?? 0;
                this.manager.runs.settleInput(r.data.bakeId, inputNum, {
                    state: RUN_STATE.FAILED,
                    failureKind: RUN_FAILURE_KIND.FATAL,
                });
                this.workerFinished(workerObj);
                break;
            case WORKER_ACTION.STATUS_MESSAGE:
                this.manager.output.updateOutputMessage(r.data.message, inputNum, true);
                break;
            case WORKER_ACTION.PROGRESS_MESSAGE:
                this.manager.output.updateOutputProgress(r.data.progress, r.data.total, inputNum);
                break;
            case WORKER_ACTION.OPTION_UPDATE:
                if (Object.prototype.hasOwnProperty.call(this.app.options, r.data.option)) {
                    log.debug(`Setting ${r.data.option} to ${r.data.value}`);
                    this.app.options[r.data.option] = r.data.value;
                }
                break;
            case WORKER_ACTION.SET_REGISTERS:
                this.manager.recipe.setRegisters(r.data.opIndex, r.data.numPrevRegisters, r.data.registers);
                break;
            default:
                log.error("Unhandled ChefWorker action policy", r.action);
                break;
        }
    }

    /**
     * Update the value of an output
     *
     * @param {Object} data
     * @param {number} inputNum
     * @param {number} bakeId
     * @param {number} recipeRevisionAtStart
     * @param {number} progress
     */
    updateOutput(data, inputNum, bakeId, recipeRevisionAtStart, progress) {
        this.manager.output.updateOutputBakeTarget(bakeId, recipeRevisionAtStart, inputNum);
        if (progress === this.recipeConfig.length) {
            progress = false;
        }
        this.manager.output.updateOutputProgress(progress, this.recipeConfig.length, inputNum);
        this.manager.output.updateOutputValue(data, inputNum, false);

        if (progress !== false) {
            this.manager.output.updateOutputStatus("error", inputNum);

            if (inputNum === this.manager.tabs.getActiveTab("input")) {
                this.manager.recipe.updateBreakpointIndicator(progress);
            }

        } else {
            this.manager.output.updateOutputStatus("baked", inputNum);
        }
    }

    /**
     * Updates the UI to show if baking is in progress or not.
     *
     * @param {boolean} bakingStatus
     */
    setBakingStatus(bakingStatus) {
        this.app.baking = bakingStatus;
        debounce(this.manager.controls.toggleBakeButtonFunction, 20, "toggleBakeButton", this, [bakingStatus ? "cancel" : "bake"])();

        if (bakingStatus) this.manager.output.hideMagicButton();
    }

    /**
     * Get the progress of the ChefWorkers
     */
    getBakeProgress() {
        const pendingInputs = this.inputNums.length + this.loadingOutputs + this.inputs.length;
        let bakingInputs = 0;

        for (let i = 0; i < this.chefWorkers.length; i++) {
            if (this.chefWorkers[i].active && this.chefWorkers[i].runTarget) {
                bakingInputs++;
            }
        }

        const total = this.totalOutputs;
        const bakedInputs = total - pendingInputs - bakingInputs;

        return {
            total: total,
            pending: pendingInputs,
            baking: bakingInputs,
            baked: bakedInputs
        };
    }

    /**
     * Cancels the current bake making it possible to autobake again
     */
    cancelBakeForAutoBake() {
        this.cancelBake(true, false, RUN_STATE.SUPERSEDED);
    }

    /**
     * Cancels the current bake by terminating and removing all ChefWorkers
     *
     * @param {boolean} [silent=false] - If true, don't set the output
     * @param {boolean} [killAll=false] - If true, kills all chefWorkers regardless of status
     * @param {string|null} [terminalState=RUN_STATE.CANCELLED] - Run state caused by cancellation.
     */
    cancelBake(silent=false, killAll=false, terminalState=RUN_STATE.CANCELLED) {
        const target = this.bakeTarget;
        if (target && terminalState) {
            this.manager.runs.settle(target.bakeId, terminalState);
        }
        const deactiveOutputs = new Set();

        for (let i = this.chefWorkers.length - 1; i >= 0; i--) {
            if (this.chefWorkers[i].active || killAll) {
                if (this.chefWorkers[i].silentTarget) {
                    this.manager.runs.settle(
                        this.chefWorkers[i].silentTarget.bakeId,
                        terminalState ?? RUN_STATE.CANCELLED
                    );
                }
                const inputNum = this.chefWorkers[i].inputNum;
                this.removeChefWorker(this.chefWorkers[i]);
                deactiveOutputs.add(inputNum);
            }
        }
        this.setBakingStatus(false);

        this.inputs.forEach(input => {
            deactiveOutputs.add(input.inputNum);
        });

        this.inputNums.forEach(inputNum => {
            deactiveOutputs.add(inputNum);
        });

        deactiveOutputs.forEach(num => {
            if (terminalState === RUN_STATE.SUPERSEDED) {
                this.manager.output.updateOutputStatus("stale", num);
            } else if (terminalState === RUN_STATE.TIMED_OUT) {
                this.manager.output.updateOutputError("Bake timed out.", num, 0);
            } else {
                this.manager.output.updateOutputStatus("inactive", num);
            }
        });

        const tabList = this.manager.tabs.getTabList("output");
        tabList.forEach(tab => {
            this.manager.tabs.getTabItem(tab, "output").style.background = "";
        });

        this.inputs = [];
        this.inputNums = [];
        this.totalOutputs = 0;
        this.loadingOutputs = 0;
        this.bakeTarget = null;
        if (terminalState === RUN_STATE.SUPERSEDED) {
            this.manager.output.markRunTargetStale(target);
        }
        if (!silent) this.manager.output.set(this.manager.tabs.getActiveTab("output"));
    }

    /**
     * Handle a worker completing baking
     *
     * @param {object} workerObj - Object containing the worker information
     * @param {ChefWorker} workerObj.worker - The actual worker object
     * @param {number} workerObj.inputNum - The inputNum of the input being baked by the worker
     * @param {boolean} workerObj.active - If true, the worker is currently baking an input
     */
    workerFinished(workerObj) {
        const workerIdx = this.chefWorkers.indexOf(workerObj);
        if (workerIdx === -1) return;
        this.chefWorkers[workerIdx].active = false;
        this.chefWorkers[workerIdx].inputNum = -1;
        this.chefWorkers[workerIdx].runTarget = null;
        if (this.inputs.length > 0) {
            if (this.isCurrentBakeTarget(this.bakeTarget)) {
                this.bakeNextInput(workerIdx);
            } else {
                this.dropStaleBakeQueue();
                this.completeStaleBakeIfIdle();
            }
        } else if (this.inputNums.length === 0 && this.loadingOutputs === 0) {
            // The ChefWorker is no longer needed
            log.debug("No more inputs to bake.");
            const progress = this.getBakeProgress();
            if (progress.total === progress.baked) {
                this.bakingComplete();
            }
        }
    }

    /**
     * Handler for completed bakes
     */
    bakingComplete() {
        this.setBakingStatus(false);
        let duration = Date.now() - this.bakeStartTime;
        duration = duration.toLocaleString() + "ms";
        const progress = this.getBakeProgress();

        if (progress.total > 1) {
            let width = progress.total.toLocaleString().length;
            if (duration.length > width) {
                width = duration.length;
            }
            width = width < 2 ? 2 : width;

            const totalStr = progress.total.toLocaleString().padStart(width, " ").replace(/ /g, "&nbsp;");
            const durationStr = duration.padStart(width, " ").replace(/ /g, "&nbsp;");

            const inputNums = Object.keys(this.manager.output.outputs);
            let avgTime = 0,
                numOutputs = 0;
            for (let i = 0; i < inputNums.length; i++) {
                const output = this.manager.output.outputs[inputNums[i]];
                if (output.status === "baked") {
                    numOutputs++;
                    avgTime += output.data.duration;
                }
            }
            avgTime = Math.round(avgTime / numOutputs).toLocaleString() + "ms";
            avgTime = avgTime.padStart(width, " ").replace(/ /g, "&nbsp;");

            const msg = `total: ${totalStr}<br>time: ${durationStr}<br>average: ${avgTime}`;

            const bakeInfo = document.getElementById("bake-info");
            bakeInfo.innerHTML = msg;
            bakeInfo.style.display = "";
        } else {
            document.getElementById("bake-info").style.display = "none";
        }

        document.getElementById("bake").style.background = "";
        this.totalOutputs = 0; // Reset for next time
        this.bakeTarget = null;
        log.debug("--- Bake complete ---");
    }

    /**
     * Bakes the next input and tells the inputWorker to load the next input
     *
     * @param {number} workerIdx - The index of the worker to bake with
     */
    bakeNextInput(workerIdx) {
        if (this.inputs.length === 0) return;
        if (workerIdx === -1) return;
        if (!this.chefWorkers[workerIdx]) return;
        if (!this.isCurrentBakeTarget(this.bakeTarget)) {
            this.dropStaleBakeQueue();
            this.completeStaleBakeIfIdle();
            return;
        }
        this.chefWorkers[workerIdx].active = true;
        const nextInput = this.inputs.splice(0, 1)[0];
        if (typeof nextInput.inputNum === "string") nextInput.inputNum = parseInt(nextInput.inputNum, 10);

        log.debug(`Baking input ${nextInput.inputNum}.`);
        this.manager.output.updateOutputMessage(`Baking input ${nextInput.inputNum}...`, nextInput.inputNum, false);
        this.manager.output.updateOutputStatus("baking", nextInput.inputNum);

        this.chefWorkers[workerIdx].inputNum = nextInput.inputNum;
        this.chefWorkers[workerIdx].runTarget = this.manager.runTargets.forInput(
            this.bakeTarget,
            nextInput.inputNum
        );
        this.manager.runs.markRunning(this.bakeTarget.bakeId, nextInput.inputNum);
        const input = nextInput.input,
            recipeConfig = this.recipeConfig;

        if (this.step) {
            // Remove all breakpoints from the recipe up to progress
            if (nextInput.progress !== false) {
                for (let i = 0; i < nextInput.progress; i++) {
                    if ("breakpoint" in recipeConfig[i]) {
                        delete recipeConfig[i].breakpoint;
                    }
                }
            }

            // Set a breakpoint at the next operation so we stop baking there
            if (recipeConfig[this.app.progress]) recipeConfig[this.app.progress].breakpoint = true;
        }

        let transferable;
        if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
            transferable = [input];
        }
        this.manager.timing.recordTime("chefWorkerTasked", nextInput.inputNum);
        try {
            this.chefWorkers[workerIdx].worker.postMessage({
                action: "bake",
                data: {
                    input: input,
                    recipeConfig: recipeConfig,
                    options: this.bakeTarget.executionOptions,
                    inputNum: nextInput.inputNum,
                    bakeId: this.bakeTarget.bakeId,
                    recipeRevisionAtStart: this.bakeTarget.recipeRevisionAtStart,
                }
            }, transferable);
        } catch {
            this.handleChefWorkerFailure(
                this.chefWorkers[workerIdx],
                RUN_FAILURE_KIND.PROTOCOL
            );
            return;
        }

        if (this.inputNums.length > 0) {
            this.requestInputForBake(this.inputNums.splice(0, 1)[0]);
        }
    }

    /**
     * Bakes the current input using the current recipe.
     *
     * @param {Object[]} recipeConfig - Recipe snapshot.
     * @param {Object} target - Immutable workspace execution target.
     */
    bake(recipeConfig, target) {
        const owner = getRunOwner(target.source);
        if (!owner) {
            throw new RunTargetError(
                RUN_TARGET_ERROR_CODE.INVALID_TARGET,
                "Run source is invalid"
            );
        }
        const request = this.manager.runs.ensure(target, {
            owner,
            mode: target.source,
            reuseFresh: false,
        });
        if (request.decision !== RUN_DECISION.STARTED) return request;

        this.bakeId = request.run.bakeId;
        this.bakeTarget = request.run.target;
        this.recipeConfig = recipeConfig;
        this.progress = this.bakeTarget.progress;
        this.step = this.bakeTarget.step;

        this.setBakingStatus(true);
        this.manager.recipe.updateBreakpointIndicator(false);
        this.bakeStartTime = Date.now();

        this.displayProgress();
        return request;
    }

    /**
     * Queues an input ready to be baked
     *
     * @param {object} inputData
     * @param {string | ArrayBuffer} inputData.input
     * @param {number} inputData.inputNum
     * @param {number} inputData.bakeId
     * @param {number} inputData.recipeRevisionAtStart
     */
    queueInput(inputData) {
        if (!this.bakeTarget || inputData.bakeId !== this.bakeTarget.bakeId ||
            inputData.recipeRevisionAtStart !== this.bakeTarget.recipeRevisionAtStart) return;
        this.loadingOutputs--;
        if (!this.app.baking || !this.matchesQueuedInput(inputData) ||
            !this.isCurrentBakeTarget(this.bakeTarget)) {
            this.dropStaleBakeQueue();
            this.completeStaleBakeIfIdle();
            return;
        }
        this.inputs.push(inputData);
        this.bakeNextInput(this.getInactiveChefWorker(true));
    }

    /**
     * Handles if an error is thrown by QueueInput
     *
     * @param {object} inputData
     * @param {number} inputData.inputNum
     * @param {number} inputData.bakeId
     * @param {number} inputData.recipeRevisionAtStart
     */
    queueInputError(inputData) {
        if (!this.bakeTarget || inputData.bakeId !== this.bakeTarget.bakeId ||
            inputData.recipeRevisionAtStart !== this.bakeTarget.recipeRevisionAtStart) return;
        this.loadingOutputs--;
        if (this.app.baking && this.matchesQueuedInput(inputData) &&
            this.isCurrentBakeTarget(this.bakeTarget)) {
            this.manager.output.updateOutputBakeTarget(
                this.bakeTarget.bakeId,
                this.bakeTarget.recipeRevisionAtStart,
                inputData.inputNum
            );
            this.manager.output.updateOutputError("Error queueing the input for a bake.", inputData.inputNum, 0);
            this.manager.runs.settleInput(this.bakeTarget.bakeId, inputData.inputNum, {
                state: RUN_STATE.FAILED,
                failureKind: RUN_FAILURE_KIND.QUEUE,
            });

            if (this.inputNums.length > 0) {
                this.requestInputForBake(this.inputNums.splice(0, 1)[0]);
            } else if (this.loadingOutputs === 0 && this.inputs.length === 0 &&
                !this.chefWorkers.some(worker => worker.active && worker.runTarget)) {
                this.bakingComplete();
            }
        } else {
            this.dropStaleBakeQueue();
            this.completeStaleBakeIfIdle();
        }
    }

    /**
     * Queues a list of inputNums to be baked by ChefWorkers, and begins baking
     *
     * @param {object} inputData
     * @param {number[]} inputData.nums - The inputNums to be queued for baking
     * @param {boolean} inputData.step - If true, only execute the next operation in the recipe
     * @param {number} inputData.progress - The current progress through the recipe. Used when stepping
     */
    async bakeInputs(inputData) {
        if (this.app.baking) return;
        let target;
        try {
            target = this.captureWorkspaceTarget(inputData);
            if (!this.manager.runTargets.executionIsCurrent(
                target,
                this.getCurrentExecutionState(target)
            )) {
                throw new RunTargetError(
                    RUN_TARGET_ERROR_CODE.TARGET_UNAVAILABLE,
                    "Workspace target changed before execution"
                );
            }
        } catch (err) {
            this.app.handleError(err, true);
            debounce(this.manager.controls.toggleBakeButtonFunction, 20, "toggleBakeButton", this, ["bake"])();
            return;
        }
        log.debug(`Baking input list [${inputData.nums.join(",")}]`);

        const inputNums = inputData.nums.filter(n => n > 0);

        this.cancelBake(true, false);

        this.inputNums = inputNums;
        this.totalOutputs = inputNums.length;
        this.app.progress = inputData.progress;

        let inactiveWorkers = 0;
        for (let i = 0; i < this.chefWorkers.length; i++) {
            if (!this.chefWorkers[i].active) {
                inactiveWorkers++;
            }
        }

        for (let i = 0; i < inputNums.length - inactiveWorkers; i++) {
            if (this.addChefWorker() === -1) break;
        }

        const runRequest = this.app.bake(target);
        if (!runRequest || runRequest.decision !== RUN_DECISION.STARTED) {
            this.inputs = [];
            this.inputNums = [];
            this.totalOutputs = 0;
            this.loadingOutputs = 0;
            return runRequest?.completion ?? null;
        }

        for (let i = 0; i < this.inputNums.length; i++) {
            this.manager.output.updateOutputMessage(`Input ${inputNums[i]} has not been baked yet.`, inputNums[i], false);
            this.manager.output.updateOutputStatus("pending", inputNums[i]);
        }

        let numBakes = this.chefWorkers.length;
        if (this.inputNums.length < numBakes) {
            numBakes = this.inputNums.length;
        }
        for (let i = 0; i < numBakes; i++) {
            this.manager.timing.recordTime("trigger", this.inputNums[0]);
            this.requestInputForBake(this.inputNums.splice(0, 1)[0]);
        }
        if (numBakes === 0) {
            this.manager.runs.settle(
                runRequest.run.bakeId,
                RUN_STATE.FAILED,
                RUN_FAILURE_KIND.WORKER
            );
            this.bakingComplete();
        }
        return await runRequest.completion;
    }

    /**
     * Asks the ChefWorker to run a silent bake, forcing the browser to load and cache all the relevant
     * JavaScript code needed to do a real bake.
     *
     * @param {Object[]} [recipeConfig]
     */
    silentBake(recipeConfig) {
        if (this.silentBakeID === Number.MAX_SAFE_INTEGER) return;
        const target = Object.freeze({
            source: RUN_MODE.SILENT,
            silentBakeId: ++this.silentBakeID,
            recipeRevisionAtStart: this.manager.recipe.getRecipeRevision(),
            inputTargets: Object.freeze([]),
        });
        const runRequest = this.manager.runs.ensure(target, {
            owner: getRunOwner(RUN_MODE.SILENT),
            mode: RUN_MODE.SILENT,
            reuseFresh: false,
            timeoutMs: 30000,
        });
        if (runRequest.decision !== RUN_DECISION.STARTED) return runRequest.completion;

        let workerId = this.getInactiveChefWorker();
        if (workerId === -1) {
            workerId = this.addChefWorker();
        }
        if (workerId === -1) {
            this.manager.runs.settle(
                runRequest.run.bakeId,
                RUN_STATE.FAILED,
                RUN_FAILURE_KIND.WORKER
            );
            return runRequest.completion;
        }

        this.chefWorkers[workerId].active = true;
        this.chefWorkers[workerId].silentTarget = runRequest.run.target;
        this.manager.runs.markRunning(runRequest.run.bakeId);
        try {
            this.chefWorkers[workerId].worker.postMessage({
                action: "silentBake",
                data: {
                    recipeConfig: recipeConfig,
                    silentBakeId: target.silentBakeId,
                    bakeId: runRequest.run.bakeId,
                    recipeRevisionAtStart: target.recipeRevisionAtStart,
                }
            });
        } catch {
            this.handleChefWorkerFailure(
                this.chefWorkers[workerId],
                RUN_FAILURE_KIND.PROTOCOL
            );
        }
        return runRequest.completion;
    }

    /**
     * Handler for messages sent back from DishWorker
     *
     * @param {MessageEvent} e
     */
    handleDishMessage(e) {
        const r = e.data,
            policy = getWorkerActionPolicy(r?.action);
        log.debug(`Receiving '${r.action}' from DishWorker`);

        if (policy?.scope !== WORKER_ACTION_SCOPE.REQUEST ||
            r.data?.id !== this.dishWorker.currentRequestId ||
            !this.dishCallbacks.has(r.data.id)) {
            log.error("Unmatched message from DishWorker");
            return;
        }

        const callback = this.dishCallbacks.get(r.data.id);
        this.dishCallbacks.delete(r.data.id);
        this.dishWorker.currentAction = "";
        this.dishWorker.currentRequestId = null;
        callback(r.data);

        if (this.dishWorkerQueue.length > 0) {
            this.postDishMessage(this.dishWorkerQueue.splice(0, 1)[0]);
        }
    }

    /**
     * Registers one callback under a non-reused pending request identity.
     *
     * @param {Function} callback - DishWorker response callback.
     * @returns {number} Request identity.
     */
    registerDishCallback(callback) {
        if (typeof callback !== "function") throw new TypeError("DishWorker callback is invalid");
        if (this.callbackID === Number.MAX_SAFE_INTEGER) {
            throw new RangeError("DishWorker request identity limit reached");
        }
        const id = ++this.callbackID;
        this.dishCallbacks.set(id, callback);
        return id;
    }

    /**
     * Asks the DishWorker to return the dish as the specified type
     *
     * @param {Dish} dish
     * @param {string} type
     * @param {Function} callback
     */
    getDishAs(dish, type, callback) {
        const id = this.registerDishCallback(callback);
        if (this.dishWorker.worker === null) this.setupDishWorker();

        this.postDishMessage({
            action: "getDishAs",
            data: {
                dish: dish,
                type: type,
                id: id
            }
        });
    }

    /**
     * Asks the DishWorker to get the title of the dish
     *
     * @param {Dish} dish
     * @param {number} maxLength
     * @param {Function} callback
     * @returns {string}
     */
    getDishTitle(dish, maxLength, callback) {
        const id = this.registerDishCallback(callback);
        if (this.dishWorker.worker === null) this.setupDishWorker();

        this.postDishMessage({
            action: "getDishTitle",
            data: {
                dish: dish,
                maxLength: maxLength,
                id: id
            }
        });
    }

    /**
     * Asks the DishWorker to translate a buffer into a specific character encoding
     *
     * @param {ArrayBuffer} buffer
     * @param {number} encoding
     * @param {Function} callback
     * @returns {string}
     */
    bufferToStr(buffer, encoding, callback) {
        const id = this.registerDishCallback(callback);
        if (this.dishWorker.worker === null) this.setupDishWorker();

        this.postDishMessage({
            action: "bufferToStr",
            data: {
                buffer: buffer,
                encoding: encoding,
                id: id
            }
        });
    }

    /**
     * Queues a message to be sent to the dishWorker
     *
     * @param {object} message
     * @param {string} message.action
     * @param {object} message.data
     * @param {Dish} message.data.dish
     * @param {number} message.data.id
     */
    queueDishMessage(message) {
        if (message.action === "getDishAs") {
            this.dishWorkerQueue = [message].concat(this.dishWorkerQueue);
        } else {
            this.dishWorkerQueue.push(message);
        }
    }

    /**
     * Sends a message to the DishWorker
     *
     * @param {object} message
     * @param {string} message.action
     * @param {object} message.data
     */
    postDishMessage(message) {
        if (this.dishWorker.currentAction !== "") {
            this.queueDishMessage(message);
        } else {
            this.dishWorker.currentAction = message.action;
            this.dishWorker.currentRequestId = message.data.id;
            this.dishWorker.worker.postMessage(message);
        }
    }

    /**
     * Sets the console log level in the workers.
     */
    setLogLevel() {
        this.chefWorkers.forEach(cw => {
            cw.worker.postMessage({
                action: "setLogLevel",
                data: log.getLevel()
            });
        });

        if (!this.dishWorker.worker) return;
        this.dishWorker.worker.postMessage({
            action: "setLogLevel",
            data: log.getLevel()
        });
    }

    /**
     * Display the bake progress in the output bar and bake button
     */
    displayProgress() {
        const progress = this.getBakeProgress();
        if (progress.total === progress.baked) return;

        const percentComplete = ((progress.pending + progress.baking) / progress.total) * 100;
        const bakeButton = document.getElementById("bake");
        if (this.app.baking) {
            if (percentComplete < 100) {
                bakeButton.style.background = `linear-gradient(to left, #fea79a ${percentComplete}%, #f44336 ${percentComplete}%)`;
            } else {
                bakeButton.style.background = "";
            }
        } else {
            // not baking
            bakeButton.style.background = "";
        }

        const bakeInfo = document.getElementById("bake-info");
        if (progress.total > 1) {
            let width = progress.total.toLocaleString().length;
            width = width < 2 ? 2 : width;

            const totalStr = progress.total.toLocaleString().padStart(width, " ").replace(/ /g, "&nbsp;");
            const bakedStr = progress.baked.toLocaleString().padStart(width, " ").replace(/ /g, "&nbsp;");
            const pendingStr = progress.pending.toLocaleString().padStart(width, " ").replace(/ /g, "&nbsp;");
            const bakingStr = progress.baking.toLocaleString().padStart(width, " ").replace(/ /g, "&nbsp;");

            let msg = "total: " + totalStr;
            msg += "<br>baked: " + bakedStr;

            if (progress.pending > 0) {
                msg += "<br>pending: " + pendingStr;
            } else if (progress.baking > 0) {
                msg += "<br>baking: " + bakingStr;
            }
            bakeInfo.innerHTML = msg;
            bakeInfo.style.display = "";
        } else {
            bakeInfo.style.display = "none";
        }

        if (progress.total !== progress.baked) {
            setTimeout(function() {
                this.displayProgress();
            }.bind(this), 100);
        }

    }

    /**
     * Asks the ChefWorker to calculate highlight offsets if possible.
     *
     * @param {Object[]} recipeConfig
     * @param {string} direction
     * @param {Object[]} pos - The position object for the highlight.
     * @param {number} pos.start - The start offset.
     * @param {number} pos.end - The end offset.
     */
    highlight(recipeConfig, direction, pos) {
        let workerIdx = this.getInactiveChefWorker(false);
        if (workerIdx === -1) {
            workerIdx = this.addChefWorker();
        }
        if (workerIdx === -1) return;
        if (this.highlightRequests.size >= MAX_PENDING_HIGHLIGHT_REQUESTS ||
            this.highlightID === Number.MAX_SAFE_INTEGER) return;
        const highlightId = ++this.highlightID,
            recipeRevisionAtStart = this.manager.recipe.getRecipeRevision();
        this.highlightRequests.set(highlightId, Object.freeze({
            workerObj: this.chefWorkers[workerIdx],
            recipeRevisionAtStart: recipeRevisionAtStart,
        }));
        this.chefWorkers[workerIdx].worker.postMessage({
            action: "highlight",
            data: {
                recipeConfig: recipeConfig,
                direction: direction,
                pos: pos,
                highlightId: highlightId,
                recipeRevisionAtStart: recipeRevisionAtStart,
            }
        });
    }
}

export default WorkerWaiter;
