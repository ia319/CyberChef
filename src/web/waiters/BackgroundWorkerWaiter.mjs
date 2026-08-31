/**
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2018
 * @license Apache-2.0
 */

import ChefWorker from "worker-loader?inline=no-fallback!../../core/ChefWorker.js";
import {
    ANALYSIS_DECISION,
    ANALYSIS_OWNER,
    ANALYSIS_STATE,
    analysisTargetMatches,
    createAnalysisTarget,
} from "../analysis/AnalysisCoordinator.mjs";


const MAX_ANALYSIS_SAMPLE_BYTES = 1000;
const MAX_ANALYSIS_CANDIDATES = 5;

/**
 * Waiter to handle conversations with a ChefWorker in the background.
 */
class BackgroundWorkerWaiter {

    /**
     * BackgroundWorkerWaiter constructor.
     *
     * @param {App} app - The main view object for CyberChef.
     * @param {Manager} manager - The CyberChef event manager.
     */
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;

        this.callbacks = new Map();
        this.callbackID = 0;
        this.activeAnalysis = null;
    }


    /**
     * Sets up the ChefWorker and associated listeners.
     */
    registerChefWorker() {
        log.debug("Registering new background ChefWorker");
        this.chefWorker = new ChefWorker();
        this.chefWorker.addEventListener("message", this.handleChefMessage.bind(this));
        this.chefWorker.addEventListener("error", this.handleChefFailure.bind(this));
        this.chefWorker.addEventListener("messageerror", this.handleChefFailure.bind(this));
        this.chefWorker.postMessage({
            action: "setLogPrefix",
            data: "BGChefWorker"
        });
        this.chefWorker.postMessage({
            action: "setLogLevel",
            data: log.getLevel()
        });

        let docURL = document.location.href.split(/[#?]/)[0];
        const index = docURL.lastIndexOf("/");
        if (index > 0) {
            docURL = docURL.substring(0, index);
        }
        this.chefWorker.postMessage({"action": "docURL", "data": docURL});
    }


    /**
     * Handler for messages sent back by the ChefWorker.
     *
     * @param {MessageEvent} e
     */
    handleChefMessage(e) {
        const r = e.data;
        if (!r || typeof r.action !== "string") return;
        log.debug(`Receiving '${r.action}' from BGChefWorker`);

        switch (r.action) {
            case "bakeComplete":
            case "bakeError": {
                const id = r.data?.id,
                    callback = this.callbacks.get(id);
                if (callback) {
                    this.callbacks.delete(id);
                    callback.call(this, r.data, id);
                }
                break;
            }
            case "workerLoaded":
                log.debug("Background ChefWorker loaded");
                break;
            case "optionUpdate":
            case "statusMessage":
            case "progressMessage":
                // Ignore these messages
                break;
            default:
                log.error("Unrecognised message from background ChefWorker", e);
                break;
        }
    }


    /**
     * Settles an active analysis after a Worker transport failure.
     */
    handleChefFailure() {
        const analysisId = this.activeAnalysis?.analysisId;
        if (analysisId === undefined) return;
        this.manager.analyses.settle(analysisId, ANALYSIS_STATE.FAILED);
        this.cancelAnalysis(analysisId);
    }


    /**
     * Cancels the current background bake and creates a new Worker.
     *
     * @param {number|null} [id=null] - Request identity when cancellation came from a timer.
     * @returns {boolean} Whether active Worker work was cancelled.
     */
    cancelBake(id=null) {
        const activeId = this.activeAnalysis?.workerRequestId;
        if (id !== null && id !== activeId) return false;
        if (activeId !== undefined) this.callbacks.delete(activeId);
        this.activeAnalysis = null;
        if (this.chefWorker)
            this.chefWorker.terminate();
        this.registerChefWorker();
        return activeId !== undefined;
    }


    /**
     * Cancels Worker work for one settled analysis.
     *
     * @param {number} analysisId - Analysis identity.
     * @returns {boolean} Whether matching Worker work was cancelled.
     */
    cancelAnalysis(analysisId) {
        if (this.activeAnalysis?.analysisId !== analysisId) return false;
        return this.cancelBake(this.activeAnalysis.workerRequestId);
    }


    /**
     * Marks active work stale when it belongs to another Output.
     *
     * @param {Object|null} target - Current completed Output target.
     * @returns {boolean} Whether stale work was cancelled.
     */
    invalidateAnalysis(target=null) {
        const active = this.activeAnalysis,
            analysis = active ? this.manager.analyses.getAnalysis(active.analysisId) : null;
        if (!analysis || target && analysisTargetMatches(analysis.target, target)) return false;
        const settled = this.manager.analyses.settle(
            analysis.analysisId,
            ANALYSIS_STATE.STALE
        );
        this.cancelAnalysis(analysis.analysisId);
        return settled;
    }


    /**
     * Asks the ChefWorker to bake the input using the specified recipe.
     *
     * @param {string} input
     * @param {Object[]} recipeConfig
     * @param {Object} options
     * @param {number} progress
     * @param {boolean} step
     * @param {Function} callback
     * @param {number|null} [recipeRevisionAtStart=null] - Recipe revision associated with the task.
     * @returns {number} Background request identity.
     */
    bake(input, recipeConfig, options, progress, step, callback, recipeRevisionAtStart=null) {
        const id = this.callbackID++;
        this.callbacks.set(id, callback);

        try {
            this.chefWorker.postMessage({
                action: "bake",
                data: {
                    input: input,
                    recipeConfig: recipeConfig,
                    options: options,
                    progress: progress,
                    step: step,
                    id: id,
                    bakeId: id,
                    recipeRevisionAtStart: recipeRevisionAtStart,
                }
            });
        } catch (err) {
            this.callbacks.delete(id);
            throw err;
        }
        return id;
    }


    /**
     * Asks the Magic operation what it can do with the input data.
     *
     * @param {ArrayBuffer} input - Bounded Output sample.
     * @param {Object} provenance - Fresh Output provenance that produced the sample.
     * @param {string} [owner=ANALYSIS_OWNER.UI] - Trusted analysis owner.
     * @param {AbortSignal|null} [signal=null] - Optional owner cancellation signal.
     * @returns {Object} Coordinator decision and optional completion Promise.
     */
    magic(input, provenance, owner=ANALYSIS_OWNER.UI, signal=null) {
        if (!(input instanceof ArrayBuffer) || input.byteLength < 1 ||
            input.byteLength > MAX_ANALYSIS_SAMPLE_BYTES) {
            throw new TypeError("Analysis sample is invalid");
        }
        const target = createAnalysisTarget(provenance);
        this.invalidateAnalysis(target);
        const request = this.manager.analyses.ensure(target, {owner, signal});
        if (request.decision !== ANALYSIS_DECISION.STARTED) return request;

        try {
            const workerRequestId = this.bake(input, [
                {
                    "op": "Magic",
                    "args": [3, false, false]
                }
            ], {}, 0, false, this.magicComplete, target.recipeRevision);
            this.activeAnalysis = {
                analysisId: request.analysis.analysisId,
                workerRequestId,
                provenance,
            };
            this.manager.analyses.markRunning(request.analysis.analysisId);
        } catch {
            this.manager.analyses.settle(
                request.analysis.analysisId,
                ANALYSIS_STATE.FAILED
            );
        }
        return request;
    }


    /**
     * Handler for completed Magic bakes.
     *
     * @param {Object} response
     * @param {number} id - Background request identity.
     */
    magicComplete(response, id) {
        log.debug("--- Background Magic Bake complete ---");
        const active = this.activeAnalysis;
        if (!active || active.workerRequestId !== id) return;
        this.activeAnalysis = null;

        const analysisId = active.analysisId;
        if (!this.manager.analyses.isActive(analysisId)) return;
        if (!response || response.recipeRevisionAtStart !== active.provenance.recipeRevision ||
            !this.manager.output.isCurrentOutputProvenance(active.provenance)) {
            this.manager.analyses.settle(analysisId, ANALYSIS_STATE.STALE);
            return;
        }
        if (response.error || !Array.isArray(response.dish?.value)) {
            this.manager.analyses.settle(analysisId, ANALYSIS_STATE.FAILED);
            return;
        }

        const candidates = response.dish.value.slice(0, MAX_ANALYSIS_CANDIDATES);
        this.manager.analyses.settle(
            analysisId,
            candidates.length ? ANALYSIS_STATE.SIGNALS_READY : ANALYSIS_STATE.NO_SUGGESTION,
            candidates.length ? candidates : null
        );
    }


    /**
     * Sets the console log level in the workers.
     */
    setLogLevel() {
        if (!this.chefWorker) return;
        this.chefWorker.postMessage({
            action: "setLogLevel",
            data: log.getLevel()
        });
    }

}


export default BackgroundWorkerWaiter;

export {
    MAX_ANALYSIS_CANDIDATES,
    MAX_ANALYSIS_SAMPLE_BYTES,
};
