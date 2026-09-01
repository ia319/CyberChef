/**
 * Utility functions for browser tests.
 *
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2023
 * @license Apache-2.0
 */

/** @function
 * Clears the recipe and input
 *
 * @param {Browser} browser - Nightwatch client
 */
function clear(browser) {
    browser
        .useCss()
        .click("#clr-recipe")
        .click("#clr-io")
        .waitForElementNotPresent("#rec-list li.operation")
        .expect.element("#input-text .cm-content").text.that.equals("");
}

/** @function
 * Sets the input to the desired string
 *
 * @param {Browser} browser - Nightwatch client
 * @param {string} input - The text to populate the input with
 * @param {boolean} [type=true] - Whether to type the characters in by using sendKeys,
 *      or to set the value of the editor directly (useful for special characters)
 */
function setInput(browser, input, type=true) {
    clear(browser);
    if (type) {
        browser
            .useCss()
            .sendKeys("#input-text .cm-content", input)
            .pause(100);
    } else {
        browser.execute(text => {
            window.app.setInput(text);
        }, [input]);
        browser.pause(100);
    }
    expectInput(browser, input);
}

/** @function
 * Triggers a bake
 *
 * @param {Browser} browser - Nightwatch client
 */
function bake(browser) {
    browser
        .pause(50)
        .waitForElementNotVisible("#output-loader", 10000)
        .waitForElementNotVisible("#snackbar-container", 6000)
        .expect.element("#bake span").text.to.equal("BAKE!");

    browser
        .execute(() => {
            const inputNum = window.app.manager.tabs.getActiveTab("input"),
                output = window.app.manager.output.outputs[inputNum];
            window.__bakePreviousId = output?.bakeId ?? null;
        })
        .click("#bake")
        .executeAsync(async done => {
            const deadline = Date.now() + 10000,
                inputNum = window.app.manager.tabs.getActiveTab("input"),
                outputWaiter = window.app.manager.output,
                previousBakeId = window.__bakePreviousId;

            while (Date.now() < deadline) {
                const output = outputWaiter.outputs[inputNum],
                    presentation = output?.presentation;
                if (output?.bakeId !== previousBakeId &&
                    outputWaiter.outputIsFresh(inputNum) &&
                    presentation?.outputGeneration === output.outputGeneration &&
                    presentation.outputVersion === output.outputVersion) {
                    const completed = await Promise.race([
                        presentation.completion.then(value => value === true).catch(() => false),
                        new Promise(resolve => setTimeout(() => resolve(null), 50)),
                    ]);
                    if (completed === true && outputWaiter.outputs[inputNum] === output &&
                        output.presentation === presentation && outputWaiter.outputIsFresh(inputNum)) {
                        delete window.__bakePreviousId;
                        done(true);
                        return;
                    }
                    if (completed === false) break;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            delete window.__bakePreviousId;
            done(false);
        }, [], ({value}) => {
            browser.assert.strictEqual(value, true, "The active Output completes the requested Bake");
        })
        .waitForElementNotVisible("#stale-indicator", 10000)
        .waitForElementNotVisible("#output-loader", 10000);
}

/** @function
 * Sets the character encoding in the input or output
 *
 * @param {Browser} browser - Nightwatch client
 * @param {string} io - Either "input" or "output"
 * @param {string} enc - The encoding to be set
 */
function setChrEnc(browser, io, enc) {
    io = `#${io}-text`;
    browser
        .useCss()
        .waitForElementNotVisible("#snackbar-container", 6000)
        .click(io + " .chr-enc-value")
        .waitForElementVisible(io + " .chr-enc-select .cm-status-bar-select-scroll")
        .click("link text", enc)
        .waitForElementNotVisible(io + " .chr-enc-select .cm-status-bar-select-scroll")
        .expect.element(io + " .chr-enc-value").text.that.equals(enc);
}

/** @function
 * Sets the end of line sequence in the input or output
 *
 * @param {Browser} browser - Nightwatch client
 * @param {string} io - Either "input" or "output"
 * @param {string} eol - The sequence to set
 */
function setEOLSeq(browser, io, eol) {
    io = `#${io}-text`;
    browser
        .useCss()
        .waitForElementNotVisible("#snackbar-container", 6000)
        .click(io + " .eol-value")
        .waitForElementVisible(io + " .eol-select .cm-status-bar-select-content")
        .click(`${io} .cm-status-bar-select-content a[data-val=${eol}]`)
        .waitForElementNotVisible(io + " .eol-select .cm-status-bar-select-content")
        .expect.element(io + " .eol-value").text.that.equals(eol);
}

/** @function
 * Copies whatever is currently selected
 *
 * @param {Browser} browser - Nightwatch client
 */
function copy(browser) {
    browser.perform(function() {
        const actions = this.actions({async: true});

        // Ctrl + Ins used as this works on Windows, Linux and Mac
        return actions
            .keyDown(browser.Keys.CONTROL)
            .keyDown(browser.Keys.INSERT)
            .keyUp(browser.Keys.INSERT)
            .keyUp(browser.Keys.CONTROL);
    });
}

/** @function
 * Pastes into the target element
 *
 * @param {Browser} browser - Nightwatch client
 * @param {string} el - Target element selector
 */
function paste(browser, el) {
    browser
        .click(el)
        .perform(function() {
            const actions = this.actions({async: true});

            // Shift + Ins used as this works on Windows, Linux and Mac
            return actions
                .keyDown(browser.Keys.SHIFT)
                .keyDown(browser.Keys.INSERT)
                .keyUp(browser.Keys.INSERT)
                .keyUp(browser.Keys.SHIFT);
        })
        .pause(100);
}

/** @function
 * Asserts raw copy data before it crosses the Windows system clipboard boundary.
 *
 * @param {Browser} browser - Nightwatch client
 * @param {number[]} expectedCharCodes - Expected leading character codes
 * @returns {void}
 */
function expectRawCopy(browser, expectedCharCodes) {
    // Windows clipboard strings are NUL-terminated, so assert the browser API boundary directly.
    browser
        .execute(() => {
            Object.defineProperty(navigator.clipboard, "writeText", {
                configurable: true,
                value: text => {
                    window.__rawCopyText = text;
                    return Promise.resolve();
                },
            });
        })
        .click("#copy-output")
        .pause(100)
        .execute(length => Array.from(
            window.__rawCopyText.slice(0, length),
            char => char.charCodeAt(0)
        ), [expectedCharCodes.length], ({value}) => {
            browser.assert.deepStrictEqual(value, expectedCharCodes);
        })
        .execute(() => {
            delete navigator.clipboard.writeText;
            delete window.__rawCopyText;
        });
}

/** @function
 * Loads a recipe and input
 *
 * @param {Browser} browser - Nightwatch client
 * @param {string|Array<string>} opName - name of operation to be loaded, array for multiple ops
 * @param {string} input - input text for test
 * @param {Array<string>|Array<Array<string>>} [args=[]] - arguments, nested if multiple ops
 */
function loadRecipe(browser, opName, input, args=[]) {
    let recipeConfig;

    if (typeof(opName) === "string") {
        recipeConfig = JSON.stringify([{
            "op": opName,
            "args": args
        }]);
    } else if (opName instanceof Array) {
        recipeConfig = JSON.stringify(
            opName.map((op, i) => {
                return {
                    op: op,
                    args: args.length ? args[i] : []
                };
            })
        );
    } else {
        throw new Error("Invalid operation type. Must be string or array of strings. Received: " + typeof(opName));
    }

    const inputEncoding = Array.from(input).some(char => char.charCodeAt(0) > 255) ? "utf8" : "latin1",
        inputConfig = Buffer.from(input, inputEncoding).toString("base64").replace(/=+$/u, "");

    browser
        .urlHash(`recipe=${encodeURIComponent(recipeConfig)}&input=${encodeURIComponent(inputConfig)}`)
        .waitForElementPresent("#rec-list li.operation");
}

/** @function
 * Tests whether the output matches a given value
 *
 * @param {Browser} browser - Nightwatch client
 * @param {string|RegExp} expected - The expected output value
 * @param {boolean} [waitNotNull=false] - Wait for the output to not be empty before testing the value
 * @param {number} [waitWindow=1000] - The number of milliseconds to wait for the output to be correct
 */
function expectOutput(browser, expected, waitNotNull=false, waitWindow=1000) {
    if (waitNotNull && expected !== "") {
        browser.waitUntil(async function() {
            const output = await this.execute(function() {
                return window.app.manager.output.outputEditorView.state.doc.toString();
            });
            return output.length;
        }, waitWindow);
    }

    browser.execute(expected => {
        return window.app.manager.output.outputEditorView.state.doc.toString();
    }, [expected], function({value}) {
        if (expected instanceof RegExp) {
            browser.expect(value).match(expected);
        } else {
            browser.expect(value).to.be.equal(expected);
        }
    });
}

/** @function
 * Tests whether the input matches a given value
 *
 * @param {Browser} browser - Nightwatch client
 * @param {string|RegExp} expected - The expected input value
 */
function expectInput(browser, expected) {
    browser.execute(expected => {
        return window.app.manager.input.inputEditorView.state.doc.toString();
    }, [expected], function({value}) {
        if (expected instanceof RegExp) {
            browser.expect(value).match(expected);
        } else {
            browser.expect(value).to.be.equal(expected);
        }
    });
}

/** @function
 * Uploads a file using the #open-file input
 *
 * @param {Browser} browser - Nightwatch client
 * @param {string} filename - A path to a file in the samples directory
 */
function uploadFile(browser, filename) {
    const filepath = require("path").resolve(__dirname + "/../samples/" + filename);

    // The file input cannot be interacted with by nightwatch while it is hidden,
    // so we temporarily expose it for the purposes of this test.
    browser.execute(() => {
        document.getElementById("open-file").style.display = "block";
    });
    browser
        .pause(100)
        .setValue("#open-file", filepath)
        .pause(100);
    browser.execute(() => {
        document.getElementById("open-file").style.display = "none";
    });
    browser.waitForElementVisible("#input-text .cm-file-details");
}

/** @function
 * Uploads a folder using the #open-folder input
 *
 * @param {Browser} browser - Nightwatch client
 * @param {string} foldername - A path to a folder in the samples directory
 */
function uploadFolder(browser, foldername) {
    const folderpath = require("path").resolve(__dirname + "/../samples/" + foldername);

    // The folder input cannot be interacted with by nightwatch while it is hidden,
    // so we temporarily expose it for the purposes of this test.
    browser.execute(() => {
        document.getElementById("open-folder").style.display = "block";
    });
    browser
        .pause(100)
        .setValue("#open-folder", folderpath)
        .pause(500);
    browser.execute(() => {
        document.getElementById("open-folder").style.display = "none";
    });
    browser.waitForElementVisible("#input-text .cm-file-details");
}


module.exports = {
    clear: clear,
    setInput: setInput,
    bake: bake,
    setChrEnc: setChrEnc,
    setEOLSeq: setEOLSeq,
    copy: copy,
    paste: paste,
    expectRawCopy: expectRawCopy,
    loadRecipe: loadRecipe,
    expectOutput: expectOutput,
    expectInput: expectInput,
    uploadFile: uploadFile,
    uploadFolder: uploadFolder
};
