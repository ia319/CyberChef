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
            let originalBake = null,
                worker = null,
                originalWordWrap,
                originalReturnType,
                hadReturnType = false,
                optionsChanged = false;
            try {
                const app = window.app,
                    manager = app.manager,
                    input = app.manager.input,
                    inputNum = app.manager.tabs.getActiveTab("input"),
                    latestValue = "latest input";

                app.manager.controls.setAutoBake(false);
                app.setRecipeConfig([{
                    op: "To Base64",
                    args: ["A-Za-z0-9+/="],
                }]);

                const before = await input.getInputState(inputNum),
                    outputBefore = manager.output.getOutputState(inputNum),
                    view = input.inputEditorView,
                    bakeIdBefore = app.manager.worker.bakeId;
                worker = manager.worker;
                originalBake = worker.bake;
                let capturedTarget = null;
                worker.bake = function(recipeConfig, target) {
                    const result = originalBake.call(this, recipeConfig, target);
                    capturedTarget = this.bakeTarget;
                    return result;
                };
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
                    run = manager.runs.getRun(capturedTarget.bakeId),
                    provenance = manager.output.getOutputProvenance(inputNum),
                    outputFreshBeforeOptions = manager.output.outputIsFresh(inputNum),
                    decode = value => typeof value === "string" ? value :
                        new TextDecoder().decode(value);
                if (!capturedTarget) throw new Error("Bake target was not captured");
                const targetInput = capturedTarget.inputTargets[0];
                originalWordWrap = app.options.wordWrap;
                optionsChanged = true;
                app.options.wordWrap = !originalWordWrap;
                const displayOptionCurrent = manager.runTargets.executionIsCurrent(
                        capturedTarget,
                        worker.getCurrentExecutionState(capturedTarget)
                    ),
                    outputFreshAfterDisplayOption = manager.output.outputIsFresh(inputNum);
                hadReturnType = Object.prototype.hasOwnProperty.call(app.options, "returnType");
                originalReturnType = app.options.returnType;
                app.options.returnType = "string";
                const executionOptionCurrent = manager.runTargets.executionIsCurrent(
                    capturedTarget,
                    worker.getCurrentExecutionState(capturedTarget)
                );
                await new Promise(resolve => setTimeout(resolve, 100));
                done({
                    beforeRevision: before.inputRevision,
                    bakeIdDelta: app.manager.worker.bakeId - bakeIdBefore,
                    flushed,
                    synchronized,
                    storedValue: decode(storedValue),
                    outputStatus: output.status,
                    outputValue: decode(output.data.result),
                    run: {
                        state: run.state,
                        terminalState: run.terminalState,
                        owner: run.owner,
                        mode: run.mode,
                        inputState: run.inputs[0].state,
                    },
                    provenance: {
                        bakeId: provenance.bakeId,
                        recipeRevision: provenance.recipeRevision,
                        inputTabId: provenance.inputTabId,
                        inputGeneration: provenance.inputGeneration,
                        inputRevision: provenance.inputRevision,
                        outputTabId: provenance.outputTabId,
                        outputGeneration: provenance.outputGeneration,
                        outputVersion: provenance.outputVersion,
                        executionOptionsVersion: provenance.executionOptionsVersion,
                        terminalState: provenance.terminalState,
                    },
                    outputFreshBeforeOptions,
                    outputFreshAfterDisplayOption,
                    outputFreshAfterExecutionOption: manager.output.outputIsFresh(inputNum),
                    target: {
                        source: capturedTarget.source,
                        inputGeneration: targetInput.inputGeneration,
                        inputRevision: targetInput.inputRevision,
                        outputGeneration: targetInput.outputGeneration,
                        bakeId: capturedTarget.bakeId,
                        recipeRevisionAtStart: capturedTarget.recipeRevisionAtStart,
                        executionOptionsVersion: capturedTarget.executionOptionsVersion,
                        bakeIdDelta: capturedTarget.bakeId - bakeIdBefore,
                        frozen: Object.isFrozen(capturedTarget) &&
                            Object.isFrozen(capturedTarget.inputTargets) &&
                            Object.isFrozen(targetInput),
                    },
                    outputBefore,
                    displayOptionCurrent,
                    executionOptionCurrent,
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            } finally {
                if (worker && originalBake) worker.bake = originalBake;
                if (worker && optionsChanged) {
                    worker.app.options.wordWrap = originalWordWrap;
                    if (hadReturnType) {
                        worker.app.options.returnType = originalReturnType;
                    } else {
                        delete worker.app.options.returnType;
                    }
                }
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
            browser.assert.deepStrictEqual(value.run, {
                state: "completed",
                terminalState: "completed",
                owner: "user",
                mode: "manual",
                inputState: "completed",
            });
            browser.assert.deepStrictEqual(value.provenance, {
                bakeId: value.target.bakeId,
                recipeRevision: value.target.recipeRevisionAtStart,
                inputTabId: 1,
                inputGeneration: value.synchronized.inputGeneration,
                inputRevision: value.synchronized.inputRevision,
                outputTabId: 1,
                outputGeneration: value.outputBefore.outputGeneration,
                outputVersion: value.outputBefore.outputVersion + 2,
                executionOptionsVersion: value.target.executionOptionsVersion,
                terminalState: "completed",
            });
            browser.assert.strictEqual(value.outputFreshBeforeOptions, true);
            browser.assert.strictEqual(value.outputFreshAfterDisplayOption, true);
            browser.assert.strictEqual(value.outputFreshAfterExecutionOption, false);
            browser.assert.strictEqual(value.target.source, "manual");
            browser.assert.strictEqual(
                value.target.inputGeneration,
                value.synchronized.inputGeneration
            );
            browser.assert.strictEqual(
                value.target.inputRevision,
                value.synchronized.inputRevision
            );
            browser.assert.strictEqual(
                value.target.outputGeneration,
                value.outputBefore.outputGeneration
            );
            browser.assert.strictEqual(value.target.bakeIdDelta, 1);
            browser.assert.strictEqual(value.target.frozen, true);
            browser.assert.strictEqual(value.displayOptionCurrent, true);
            browser.assert.strictEqual(value.executionOptionCurrent, false);
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

    "Auto Bake and Step capture their execution sources": browser => {
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager,
                input = manager.input,
                worker = manager.worker,
                originalBake = worker.bake,
                captured = [];
            try {
                worker.bake = function(recipeConfig, target) {
                    const result = originalBake.call(this, recipeConfig, target);
                    captured.push({
                        source: this.bakeTarget.source,
                        step: this.bakeTarget.step,
                    });
                    return result;
                };
                manager.controls.setAutoBake(true);

                const view = input.inputEditorView;
                view.dispatch({changes: {from: view.state.doc.length, insert: "!"}});
                await input.flushActiveInput();

                let deadline = Date.now() + 5000;
                while ((!captured.some(target => target.source === "auto") || app.baking) &&
                    Date.now() < deadline) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }

                manager.controls.setAutoBake(false);
                await app.step();
                deadline = Date.now() + 5000;
                while ((!captured.some(target => target.source === "step") || app.baking) &&
                    Date.now() < deadline) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                done({captured});
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            } finally {
                worker.bake = originalBake;
                manager.controls.setAutoBake(false);
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.deepStrictEqual(value.captured, [
                {source: "auto", step: false},
                {source: "step", step: true},
            ]);
        });
    },

    "Reused Input numbers receive a new generation": browser => {
        browser.executeAsync(async done => {
            try {
                const input = window.app.manager.input,
                    output = window.app.manager.output,
                    before = await input.getInputState(1),
                    outputBefore = output.getOutputState(1);

                input.clearAllIoClick();
                const after = await input.getInputState(1),
                    outputAfter = output.getOutputState(1);
                done({before, after, outputBefore, outputAfter});
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
            browser.assert.notStrictEqual(
                value.outputBefore.outputGeneration,
                value.outputAfter.outputGeneration
            );
        });
    },

    "Active tab selection advances the view version": browser => {
        browser.executeAsync(async done => {
            try {
                const app = window.app,
                    manager = app.manager,
                    firstInput = await manager.input.getInputState(1),
                    firstOutput = manager.output.getOutputState(1),
                    initialView = manager.tabs.getViewState(),
                    target = manager.runTargets.capture({
                        source: "manual",
                        recipeRevisionAtStart: manager.recipe.getRecipeRevision(),
                        inputStates: [firstInput],
                        outputStates: [firstOutput],
                        ...initialView,
                        executionOptions: app.options,
                        progress: 0,
                        step: false,
                    });

                manager.input.addInput(false);
                await manager.input.getInputState(2);
                const afterInactiveAdd = manager.tabs.getViewState();

                manager.input.changeTab(2, false);
                const inputChanged = manager.tabs.getViewState(),
                    targetCurrentAfterInputChange = manager.runTargets.viewIsCurrent(
                        target,
                        inputChanged
                    );

                manager.output.changeTab(2, false);
                const outputChanged = manager.tabs.getViewState();
                done({
                    initialView,
                    afterInactiveAdd,
                    inputChanged,
                    outputChanged,
                    targetCurrentAfterInputChange,
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(
                value.afterInactiveAdd.viewVersion,
                value.initialView.viewVersion
            );
            browser.assert.strictEqual(
                value.inputChanged.viewVersion,
                value.initialView.viewVersion + 1
            );
            browser.assert.strictEqual(value.inputChanged.tabsSynchronized, false);
            browser.assert.strictEqual(value.targetCurrentAfterInputChange, false);
            browser.assert.strictEqual(
                value.outputChanged.viewVersion,
                value.initialView.viewVersion + 2
            );
            browser.assert.strictEqual(value.outputChanged.tabsSynchronized, true);
        });
    },

    "Input changes make an in-flight Bake target stale": browser => {
        browser.executeAsync(async done => {
            try {
                const app = window.app,
                    manager = app.manager,
                    input = manager.input;

                manager.controls.setAutoBake(false);
                input.clearAllIoClick();
                await input.getInputState(1);
                app.setRecipeConfig([
                    {op: "Sleep", args: [300]},
                    {op: "To Base64", args: ["A-Za-z0-9+/="]},
                ]);

                const view = input.inputEditorView;
                view.dispatch({
                    changes: {
                        from: 0,
                        to: view.state.doc.length,
                        insert: "before",
                    },
                });
                const before = await input.flushActiveInput();
                await input.bakeAll();

                const startDeadline = Date.now() + 5000;
                while ((!manager.worker.bakeTarget || !app.baking) && Date.now() < startDeadline) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                if (!manager.worker.bakeTarget) throw new Error("Bake did not start");
                const staleTarget = manager.worker.bakeTarget;

                view.dispatch({
                    changes: {
                        from: 0,
                        to: view.state.doc.length,
                        insert: "after",
                    },
                });
                const after = await input.flushActiveInput(),
                    finishDeadline = Date.now() + 5000;
                while (app.baking && Date.now() < finishDeadline) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                await new Promise(resolve => setTimeout(resolve, 50));

                const output = manager.output.outputs[1];
                done({
                    before,
                    after,
                    source: staleTarget.source,
                    targetCurrent: manager.runTargets.executionIsCurrent(
                        staleTarget,
                        manager.worker.getCurrentExecutionState(staleTarget)
                    ),
                    outputStatus: output.status,
                    outputHasData: output.data !== null,
                    baking: app.baking,
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.source, "manual");
            browser.assert.strictEqual(
                value.after.inputRevision,
                value.before.inputRevision + 1
            );
            browser.assert.strictEqual(value.targetCurrent, false);
            browser.assert.strictEqual(value.outputStatus, "stale");
            browser.assert.strictEqual(value.outputHasData, false);
            browser.assert.strictEqual(value.baking, false);
        });
    },

    "Input Worker replacement rejects pending reads": browser => {
        browser.executeAsync(async done => {
            try {
                const input = window.app.manager.input,
                    oldWorker = input.inputWorker,
                    originalPostMessage = oldWorker.postMessage.bind(oldWorker);
                oldWorker.postMessage = (...args) => {
                    if (args[0]?.action === "getInput") return;
                    return originalPostMessage(...args);
                };

                const pendingRead = input.getInputValue(1).then(
                    () => ({state: "resolved"}),
                    err => ({state: "rejected", name: err.name})
                );
                input.clearAllIoClick();

                const outcome = await Promise.race([
                        pendingRead,
                        new Promise(resolve => setTimeout(
                            () => resolve({state: "timed-out"}),
                            500
                        )),
                    ]),
                    currentState = await input.getInputState(1);
                done({
                    outcome,
                    workerReplaced: input.inputWorker !== oldWorker,
                    inputNum: currentState.inputNum,
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.deepStrictEqual(value.outcome, {
                state: "rejected",
                name: "AbortError",
            });
            browser.assert.strictEqual(value.workerReplaced, true);
            browser.assert.strictEqual(value.inputNum, 1);
        });
    },

    "Queued Input flush retries after an earlier failure": browser => {
        browser.executeAsync(async done => {
            const input = window.app.manager.input,
                originalFlushPendingInputChanges = input.flushPendingInputChanges;
            let callCount = 0,
                rejectFirst;
            try {
                input.flushPendingInputChanges = function(inputNum) {
                    callCount++;
                    if (callCount === 1) {
                        return new Promise((resolve, reject) => {
                            rejectFirst = reject;
                        });
                    }
                    return originalFlushPendingInputChanges.call(this, inputNum);
                };

                const first = input.flushActiveInput().then(
                        () => ({state: "resolved"}),
                        err => ({state: "rejected", message: err.message})
                    ),
                    queued = input.flushActiveInput();
                rejectFirst(new Error("Controlled earlier flush failure"));
                const [firstOutcome, queuedState] = await Promise.all([first, queued]);
                done({firstOutcome, queuedState, callCount});
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}, callCount});
            } finally {
                input.flushPendingInputChanges = originalFlushPendingInputChanges;
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.deepStrictEqual(value.firstOutcome, {
                state: "rejected",
                message: "Controlled earlier flush failure",
            });
            browser.assert.strictEqual(value.queuedState.inputNum, 1);
            browser.assert.strictEqual(value.callCount, 2);
        });
    },

    after: browser => {
        browser.end();
    },
};
