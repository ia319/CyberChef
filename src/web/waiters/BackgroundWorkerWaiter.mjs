/**
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2018
 * @license Apache-2.0
 */

import ChefWorker from "worker-loader?inline=no-fallback!../../core/ChefWorker.js";
import {RUN_STATE} from "../run/RunCoordinator.mjs";

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
        this.magicProvenance = new Map();
        this.callbackID = 0;
        this.activeMagicId = null;
        this.timeout = null;
    }


    /**
     * Sets up the ChefWorker and associated listeners.
     */
    registerChefWorker() {
        log.debug("Registering new background ChefWorker");
        this.chefWorker = new ChefWorker();
        this.chefWorker.addEventListener("message", this.handleChefMessage.bind(this));
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
                    if (this.activeMagicId === id) {
                        clearTimeout(this.timeout);
                        this.activeMagicId = null;
                        this.timeout = null;
                    }
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
     * Cancels the current bake by terminating the ChefWorker and creating a new one.
     *
     * @param {number|null} [id=null] - Request identity when cancellation came from a timer.
     */
    cancelBake(id=null) {
        if (id !== null && id !== this.activeMagicId) return;
        clearTimeout(this.timeout);
        this.timeout = null;
        if (this.activeMagicId !== null) {
            this.callbacks.delete(this.activeMagicId);
            this.magicProvenance.delete(this.activeMagicId);
            this.activeMagicId = null;
        }
        if (this.chefWorker)
            this.chefWorker.terminate();
        this.registerChefWorker();
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
     * @param {string|ArrayBuffer} input
     * @param {Object} provenance - Fresh Output provenance that produced the sample.
     */
    magic(input, provenance) {
        if (!provenance || provenance.terminalState !== RUN_STATE.COMPLETED) return;

        // If we're still working on the previous bake, cancel it before starting a new one.
        if (this.activeMagicId !== null) this.cancelBake(this.activeMagicId);

        const id = this.bake(input, [
            {
                "op": "Magic",
                "args": [3, false, false]
            }
        ], {}, 0, false, this.magicComplete, provenance.recipeRevision);
        this.magicProvenance.set(id, provenance);
        this.activeMagicId = id;

        // Cancel this bake if it takes too long.
        this.timeout = setTimeout(() => this.cancelBake(id), 3000);
    }


    /**
     * Handler for completed Magic bakes.
     *
     * @param {Object} response
     * @param {number} id - Background request identity.
     */
    magicComplete(response, id) {
        log.debug("--- Background Magic Bake complete ---");
        const provenance = this.magicProvenance.get(id);
        this.magicProvenance.delete(id);
        if (!provenance || !response || response.error ||
            response.recipeRevisionAtStart !== provenance.recipeRevision) return;

        this.manager.output.backgroundMagicResult(response.dish.value, provenance);
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
