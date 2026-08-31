/**
 * Tests Worker-confirmed Input synchronization before execution.
 *
 * @license Apache-2.0
 */

module.exports = {
    before: browser => {
        browser
            .resizeWindow(1280, 800)
            .url(browser.launchUrl)
            .useCss()
            .waitForElementNotPresent("#preloader", 10000);
    },

    "Manual Bake uses the latest Worker-confirmed Input": browser => {
        browser.executeAsync(async done => {
            try {
                const app = window.app,
                    input = app.manager.input,
                    inputNum = app.manager.tabs.getActiveTab("input"),
                    latestValue = "latest input";

                app.manager.controls.setAutoBake(false);
                app.setRecipeConfig([{
                    op: "To Base64",
                    args: ["A-Za-z0-9+/="],
                }]);

                const before = await input.getInputState(inputNum),
                    view = input.inputEditorView,
                    bakeIdBefore = app.manager.worker.bakeId;
                app.manager.controls.setAutoBake(true);
                view.dispatch({
                    changes: {
                        from: 0,
                        to: view.state.doc.length,
                        insert: latestValue,
                    },
                });

                const [flushed, synchronized] = await Promise.all([
                        input.flushActiveInput(),
                        input.bakeAll(),
                    ]),
                    deadline = Date.now() + 10000;
                while (app.manager.output.outputs[inputNum].status !== "baked" &&
                    Date.now() < deadline) {
                    await new Promise(resolve => setTimeout(resolve, 20));
                }

                const storedValue = await input.getInputValue(inputNum),
                    output = app.manager.output.outputs[inputNum],
                    decode = value => typeof value === "string" ? value :
                        new TextDecoder().decode(value);
                await new Promise(resolve => setTimeout(resolve, 100));
                done({
                    beforeRevision: before.inputRevision,
                    bakeIdDelta: app.manager.worker.bakeId - bakeIdBefore,
                    flushed,
                    synchronized,
                    storedValue: decode(storedValue),
                    outputStatus: output.status,
                    outputValue: decode(output.data.result),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(
                value.synchronized.inputRevision,
                value.beforeRevision + 1
            );
            browser.assert.deepStrictEqual(value.flushed, value.synchronized);
            browser.assert.strictEqual(value.bakeIdDelta, 1);
            browser.assert.strictEqual(value.storedValue, "latest input");
            browser.assert.strictEqual(value.outputStatus, "baked");
            browser.assert.strictEqual(value.outputValue, "bGF0ZXN0IGlucHV0");
        });
    },

    "Encoding and EOL changes advance the Input revision": browser => {
        browser.executeAsync(async done => {
            try {
                const app = window.app,
                    input = app.manager.input,
                    inputNum = app.manager.tabs.getActiveTab("input"),
                    before = await input.getInputState(inputNum);

                app.manager.controls.setAutoBake(false);
                input.chrEncChange(1252, true);
                const afterEncoding = await input.flushActiveInput();

                input.eolChange("CRLF", true);
                await new Promise(resolve => setTimeout(resolve));
                const afterEol = await input.flushActiveInput(),
                    stored = await input.getInputObj(inputNum);
                done({
                    before,
                    afterEncoding,
                    afterEol,
                    storedEncoding: stored.encoding,
                    storedEol: stored.eolSequence,
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(
                value.afterEncoding.inputRevision,
                value.before.inputRevision + 1
            );
            browser.assert.strictEqual(
                value.afterEol.inputRevision,
                value.afterEncoding.inputRevision + 1
            );
            browser.assert.strictEqual(value.storedEncoding, 1252);
            browser.assert.strictEqual(value.storedEol, "\r\n");
        });
    },

    "Reused Input numbers receive a new generation": browser => {
        browser.executeAsync(async done => {
            try {
                const input = window.app.manager.input,
                    before = await input.getInputState(1);

                input.clearAllIoClick();
                const after = await input.getInputState(1);
                done({before, after});
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.before.inputNum, value.after.inputNum);
            browser.assert.notStrictEqual(
                value.before.inputGeneration,
                value.after.inputGeneration
            );
            browser.assert.strictEqual(value.after.inputRevision, 0);
        });
    },

    after: browser => {
        browser.end();
    },
};
