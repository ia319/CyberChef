/**
 * Web Worker to handle communications between the front-end and the core.
 *
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2017
 * @license Apache-2.0
 */

import Chef from "./Chef.mjs";
import OperationConfig from "./config/OperationConfig.json" with { type: "json" };
import OpModules from "./config/modules/OpModules.mjs";
import loglevelMessagePrefix from "loglevel-message-prefix";


// Set up Chef instance
self.chef = new Chef();

self.OpModules = OpModules;
self.OperationConfig = OperationConfig;
self.inputNum = -1;
self.runToken = null;


// Tell the app that the worker has loaded and is ready to operate
self.postMessage({
    action: "workerLoaded",
    data: {}
});

/**
 * Responds to page commands and preserves request identity in asynchronous replies.
 *
 * @param {MessageEvent} e - Page command.
 */
self.addEventListener("message", function(e) {
    // Handle message
    const r = e.data;
    log.debug(`Receiving command '${r.action}'`);

    switch (r.action) {
        case "bake":
            bake(r.data);
            break;
        case "silentBake":
            silentBake(r.data);
            break;
        case "getDishAs":
            getDishAs(r.data);
            break;
        case "getDishTitle":
            getDishTitle(r.data);
            break;
        case "docURL":
            // Used to set the URL of the current document so that scripts can be
            // imported into an inline worker.
            self.docURL = r.data;
            break;
        case "highlight":
            calculateHighlights(r.data);
            break;
        case "setLogLevel":
            log.setLevel(r.data, false);
            break;
        case "setLogPrefix":
            loglevelMessagePrefix(log, {
                prefixes: [],
                staticPrefixes: [r.data]
            });
            break;
        default:
            break;
    }
});


/**
 * Copies the current Run identity into one Worker response.
 *
 * @returns {Object} Run identity fields.
 */
function getRunTokenData() {
    return {
        bakeId: self.runToken?.bakeId,
        recipeRevisionAtStart: self.runToken?.recipeRevisionAtStart,
        inputNum: self.inputNum,
    };
}


/**
 * Baking handler
 *
 * @param {Object} data
 */
async function bake(data) {
    self.inputNum = data.inputNum === undefined ? -1 : data.inputNum;
    self.runToken = Object.freeze({
        bakeId: data.bakeId,
        recipeRevisionAtStart: data.recipeRevisionAtStart,
    });
    try {
        // Module loading can emit status messages, so establish the Run identity first.
        self.loadRequiredModules(data.recipeConfig);
        const response = await self.chef.bake(
            data.input,          // The user's input
            data.recipeConfig,   // The configuration of the recipe
            data.options         // Options set by the user
        );

        const transferable = (response.dish.value instanceof ArrayBuffer) ?
            [response.dish.value] :
            undefined;

        self.postMessage({
            action: "bakeComplete",
            data: Object.assign(response, getRunTokenData(), {
                id: data.id,
            })
        }, transferable);

    } catch (err) {
        self.postMessage({
            action: "bakeError",
            data: {
                error: err.message || err,
                id: data.id,
                ...getRunTokenData(),
            }
        });
    }
    self.inputNum = -1;
    self.runToken = null;
}


/**
 * Silent baking handler
 */
async function silentBake(data) {
    const duration = await self.chef.silentBake(data.recipeConfig);

    self.postMessage({
        action: "silentBakeComplete",
        data: {
            duration: duration,
            silentBakeId: data.silentBakeId,
            recipeRevisionAtStart: data.recipeRevisionAtStart,
        }
    });
}


/**
 * Translates the dish to a given type.
 */
async function getDishAs(data) {
    const value = await self.chef.getDishAs(data.dish, data.type);
    const transferable = (data.type === "ArrayBuffer") ? [value] : undefined;
    self.postMessage({
        action: "dishReturned",
        data: {
            value: value,
            id: data.id
        }
    }, transferable);
}


/**
 * Gets the dish title
 *
 * @param {object} data
 * @param {Dish} data.dish
 * @param {number} data.maxLength
 * @param {number} data.id
 */
async function getDishTitle(data) {
    const title = await self.chef.getDishTitle(data.dish, data.maxLength);
    self.postMessage({
        action: "dishReturned",
        data: {
            value: title,
            id: data.id
        }
    });
}


/**
 * Calculates highlight offsets if possible.
 *
 * @param {Object} data - Highlight request and identity.
 */
async function calculateHighlights(data) {
    let result = null;
    try {
        result = await self.chef.calculateHighlights(data.recipeConfig, data.direction, data.pos);
    } catch (err) {
        // Highlighting is optional and must still settle its request identity.
    }

    self.postMessage({
        action: "highlightsCalculated",
        data: {
            pos: result?.pos ?? null,
            direction: result?.direction ?? data.direction,
            highlightId: data.highlightId,
            recipeRevisionAtStart: data.recipeRevisionAtStart,
        }
    });
}


/**
 * Checks that all required modules are loaded and loads them if not.
 *
 * @param {Object} recipeConfig
 */
self.loadRequiredModules = function(recipeConfig) {
    recipeConfig.forEach(op => {
        const module = self.OperationConfig[op.op].module;

        if (!(module in OpModules)) {
            log.info(`Loading ${module} module`);
            self.sendStatusMessage(`Loading ${module} module`);
            self.importScripts(`${self.docURL}/modules/${module}.js`); // lgtm [js/client-side-unvalidated-url-redirection]
            self.sendStatusMessage("");
        }
    });
};


/**
 * Send status update to the app.
 *
 * @param {string} msg
 */
self.sendStatusMessage = function(msg) {
    self.postMessage({
        action: "statusMessage",
        data: {
            message: msg,
            ...getRunTokenData(),
        }
    });
};


/**
 * Send progress update to the app.
 *
 * @param {number} progress
 * @param {number} total
 */
self.sendProgressMessage = function(progress, total) {
    self.postMessage({
        action: "progressMessage",
        data: {
            progress: progress,
            total: total,
            ...getRunTokenData(),
        }
    });
};


/**
 * Send an option value update to the app.
 *
 * @param {string} option
 * @param {*} value
 */
self.setOption = function(option, value) {
    self.postMessage({
        action: "optionUpdate",
        data: {
            option: option,
            value: value,
            ...getRunTokenData(),
        }
    });
};


/**
 * Send register values back to the app.
 *
 * @param {number} opIndex
 * @param {number} numPrevRegisters
 * @param {string[]} registers
 */
self.setRegisters = function(opIndex, numPrevRegisters, registers) {
    self.postMessage({
        action: "setRegisters",
        data: {
            opIndex: opIndex,
            numPrevRegisters: numPrevRegisters,
            registers: registers,
            ...getRunTokenData(),
        }
    });
};
