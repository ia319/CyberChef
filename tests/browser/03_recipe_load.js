/**
 * Regression tests for recipe loading behaviour.
 *
 * @author C85297 [95289555+C85297@users.noreply.github.com]
 * @copyright Crown Copyright
 * @license Apache-2.0
 */

const utils = require("./browserUtils.js");

module.exports = {
    before: browser => {
        browser
            .resizeWindow(1280, 800)
            .url(browser.launchUrl)
            .useCss()
            .waitForElementNotPresent("#preloader", 10000);
    },

    "Recipe load preserves populated arguments": browser => {
        const inputFormat = "HH:mm:ss a MMM DD, YYYY ";
        const input = "10:20:30 pm Sep 26, 2019 ";

        utils.loadRecipe(
            browser,
            "Translate DateTime Format",
            input,
            [
                "Standard date and time",
                inputFormat,
                "UTC",
                "DD/MM/YYYY HH:mm:ss",
                "UTC"
            ]
        );

        browser.execute(() => {
            return Array.from(document.querySelectorAll("#rec-list li.operation .arg"))
                .map(arg => arg.value);
        }, [], function({value}) {
            browser.expect(value[1]).to.equal(inputFormat);
        });
    },

    "Recipe model preserves runtime identity and compatible exports": browser => {
        browser.execute(() => {
            const recipe = window.app.manager.recipe,
                beforeReplaceRevision = recipe.getReadProjection().recipeRevision;

            window.__userRecipeChanges = [];
            window.addEventListener("recipechange", event => {
                if (event.detail.actor === "user") window.__userRecipeChanges.push(event.detail);
            });

            window.app.setRecipeConfig([
                {op: "To Base64", args: ["A-Za-z0-9+/="]},
                {op: "To Base64", args: ["A-Za-z0-9-_"]},
            ]);
            const loaded = recipe.getReadProjection(),
                loadedIds = loaded.steps.map(step => step.stepId);

            window.dispatchEvent(window.app.manager.statechange);
            const afterViewChange = recipe.getReadProjection();

            const firstOperation = document.querySelector(
                `[data-recipe-step-id="${loadedIds[0]}"]`
            );
            firstOperation.querySelector(".arg").value = "A-Za-z0-9-_";
            firstOperation.querySelector(".arg").dispatchEvent(new Event("input", {bubbles: true}));
            const afterArgumentChange = recipe.getReadProjection();

            const recipeList = document.getElementById("rec-list"),
                operations = recipeList.querySelectorAll("li.operation");
            recipeList.insertBefore(operations[1], operations[0]);
            recipe.commitUserDOMChange("sort");
            const afterMove = recipe.getReadProjection();

            firstOperation.querySelector(".disable-icon").click();
            firstOperation.querySelector(".breakpoint").click();
            const afterFlags = recipe.getReadProjection();

            const deletedId = loadedIds[1],
                deletedOperation = document.querySelector(`[data-recipe-step-id="${deletedId}"]`);
            deletedOperation.remove();
            recipeList.dispatchEvent(window.app.manager.operationremove);
            const afterDeletion = recipe.getReadProjection();

            recipe.addOperation("To Base64");
            const afterInsertion = recipe.getReadProjection(),
                exportedConfig = window.app.getRecipeConfig(),
                storedIdentity = Object.keys(window.localStorage).some(key =>
                    window.localStorage.getItem(key)?.includes("recipe-step-")
                );

            return {
                replaceRevisionDelta: loaded.recipeRevision - beforeReplaceRevision,
                loadedIds,
                viewRevision: afterViewChange.recipeRevision,
                argumentRevision: afterArgumentChange.recipeRevision,
                argumentStepId: afterArgumentChange.steps[0].stepId,
                moveRevision: afterMove.recipeRevision,
                movedIds: afterMove.steps.map(step => step.stepId),
                flagsRevision: afterFlags.recipeRevision,
                flaggedStep: afterFlags.steps.find(step => step.stepId === loadedIds[0]),
                deletionRevision: afterDeletion.recipeRevision,
                deletedIdPresent: afterDeletion.steps.some(step => step.stepId === deletedId),
                insertionRevision: afterInsertion.recipeRevision,
                insertedId: afterInsertion.steps.at(-1).stepId,
                exportedConfig,
                storedIdentity,
                changeSources: window.__userRecipeChanges.map(change => change.source),
                changeRevisions: window.__userRecipeChanges.map(change => [
                    change.beforeRevision,
                    change.afterRevision,
                ]),
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.replaceRevisionDelta, 1);
            browser.assert.notStrictEqual(value.loadedIds[0], value.loadedIds[1]);
            browser.assert.strictEqual(value.viewRevision, value.argumentRevision - 1);
            browser.assert.strictEqual(value.argumentStepId, value.loadedIds[0]);
            browser.assert.strictEqual(value.moveRevision, value.argumentRevision + 1);
            browser.assert.deepStrictEqual(value.movedIds, [value.loadedIds[1], value.loadedIds[0]]);
            browser.assert.strictEqual(value.flagsRevision, value.moveRevision + 2);
            browser.assert.strictEqual(value.flaggedStep.disabled, true);
            browser.assert.strictEqual(value.flaggedStep.breakpoint, true);
            browser.assert.strictEqual(value.deletionRevision, value.flagsRevision + 1);
            browser.assert.strictEqual(value.deletedIdPresent, false);
            browser.assert.strictEqual(value.insertionRevision, value.deletionRevision + 1);
            browser.assert.notStrictEqual(value.insertedId, value.loadedIds[0]);
            browser.assert.notStrictEqual(value.insertedId, value.loadedIds[1]);
            browser.assert.strictEqual(JSON.stringify(value.exportedConfig).includes("recipe-step-"), false);
            browser.assert.strictEqual(value.storedIdentity, false);
            browser.assert.deepStrictEqual(value.changeSources, [
                "api",
                "ingredient",
                "sort",
                "disable",
                "breakpoint",
                "remove",
                "insert",
            ]);
            browser.assert.strictEqual(
                value.changeRevisions.every(revisions => revisions[1] === revisions[0] + 1),
                true
            );
        });

        browser
            .pause(50)
            .url(function({value}) {
                browser.assert.strictEqual(value.includes("recipe-step-"), false);
            });
    },

    "Failed Recipe replacement restores the committed workspace": browser => {
        browser.execute(() => {
            const app = window.app,
                recipe = app.manager.recipe;

            app.setRecipeConfig([{op: "To Hex", args: ["Space", 0]}]);
            const before = recipe.getReadProjection(),
                beforeConfig = recipe.getConfig();
            let errorName = null;
            try {
                app.setRecipeConfig([{op: "Unknown operation", args: []}]);
            } catch (err) {
                errorName = err.name;
            }

            return {
                errorName,
                beforeRevision: before.recipeRevision,
                afterRevision: recipe.getReadProjection().recipeRevision,
                beforeConfig,
                afterConfig: recipe.getConfig(),
                visibleOperation: document.querySelector("#rec-list .op-title")?.textContent,
                visibleStepId: document.querySelector("#rec-list .operation")?.dataset.recipeStepId,
                expectedStepId: before.steps[0].stepId,
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.errorName, "TypeError");
            browser.assert.strictEqual(value.afterRevision, value.beforeRevision);
            browser.assert.deepStrictEqual(value.afterConfig, value.beforeConfig);
            browser.assert.strictEqual(value.visibleOperation, "To Hex");
            browser.assert.strictEqual(value.visibleStepId, value.expectedStepId);
        });
    },

    "Recipe projection restores argument selector visibility": browser => {
        browser.execute(() => {
            const app = window.app;
            app.manager.controls.setAutoBake(false);
            app.setRecipeConfig([{op: "SHA2", args: ["256", 64, 160]}]);

            const groups = document.querySelectorAll(
                "#rec-list .operation .ingredients .form-group"
            );
            return {
                selectedSize: document.querySelector("#rec-list .arg-selector").value,
                sha256RoundsVisible: !groups[1].classList.contains("d-none"),
                sha512RoundsHidden: groups[2].classList.contains("d-none"),
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.selectedSize, "256");
            browser.assert.strictEqual(value.sha256RoundsVisible, true);
            browser.assert.strictEqual(value.sha512RoundsHidden, true);
        });
    },

    "Agent Recipe transaction skips normal Auto Bake": browser => {
        browser.execute(() => {
            const app = window.app,
                recipe = app.manager.recipe;

            app.manager.controls.setAutoBake(true);
            app.setRecipeConfig([
                {op: "To Base64", args: ["A-Za-z0-9+/="]},
                {op: "To Base64", args: ["A-Za-z0-9+/="]},
            ]);
            window.dispatchEvent(app.manager.statechange);

            const before = recipe.getReadProjection(),
                firstStep = document.querySelector(
                    `[data-recipe-step-id="${before.steps[0].stepId}"]`
                ),
                secondStep = document.querySelector(
                    `[data-recipe-step-id="${before.steps[1].stepId}"]`
                );
            firstStep.querySelector(".hide-args-icon").click();
            secondStep.querySelector(".arg").focus();

            const ingredientHandlerCount = () => Object.values(app.manager.dynamicHandlers)
                .flat()
                .filter(handler => handler.scope?.dynamicHandlerGroup === "recipeIngredient")
                .length;

            window.__recipeChangeEvents = [];
            const recipeChangeHandler = event => {
                window.__recipeChangeEvents.push(event.detail);
            };
            window.addEventListener("recipechange", recipeChangeHandler);

            const bakeId = app.manager.worker.bakeId;
            let result;
            try {
                result = recipe.applyAgentPatch({
                    expectedRevision: before.recipeRevision,
                    changes: [
                        {
                            type: "setArgument",
                            stepId: before.steps[1].stepId,
                            argumentIndex: 0,
                            value: "A-Za-z0-9-_",
                        },
                        {
                            type: "move",
                            stepId: before.steps[1].stepId,
                            beforeStepId: before.steps[0].stepId,
                        },
                        {
                            type: "insert",
                            operation: "To Hex",
                            afterStepId: before.steps[0].stepId,
                        },
                    ],
                });
            } finally {
                window.removeEventListener("recipechange", recipeChangeHandler);
            }

            window.__agentRecipeTransaction = {
                bakeId,
                beforeRevision: before.recipeRevision,
                result,
                firstStepId: before.steps[0].stepId,
                secondStepId: before.steps[1].stepId,
                ingredientHandlerCount: ingredientHandlerCount(),
            };
        });

        browser.pause(100).execute(() => {
            const app = window.app,
                recipe = app.manager.recipe,
                record = window.__agentRecipeTransaction,
                projection = recipe.getReadProjection(),
                activeOperation = document.activeElement.closest("li.operation"),
                firstStep = document.querySelector(
                    `[data-recipe-step-id="${record.firstStepId}"]`
                );

            return {
                result: record.result,
                recipeRevision: projection.recipeRevision,
                stepIds: projection.steps.map(step => step.stepId),
                config: recipe.getConfig(),
                bakeIdBefore: record.bakeId,
                bakeIdAfter: app.manager.worker.bakeId,
                outputStatuses: Object.values(app.manager.output.outputs).map(output => output.status),
                staleVisible: !document.getElementById("stale-indicator").classList.contains("hidden"),
                eventCount: window.__recipeChangeEvents.length,
                event: window.__recipeChangeEvents[0],
                ingredientHandlerCountBefore: record.ingredientHandlerCount,
                ingredientHandlerCountAfter: Object.values(app.manager.dynamicHandlers)
                    .flat()
                    .filter(handler => handler.scope?.dynamicHandlerGroup === "recipeIngredient")
                    .length,
                firstStepCollapsed: firstStep.querySelector(".hide-args-icon")
                    .getAttribute("hide-args") === "true",
                focusedStepId: activeOperation?.dataset.recipeStepId ?? null,
                focusedArgumentIndex: activeOperation ?
                    Array.from(activeOperation.querySelectorAll(".arg")).indexOf(document.activeElement) : -1,
                urlContainsRuntimeId: window.location.href.includes("transaction-step-"),
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.result.status, "committed");
            browser.assert.strictEqual(value.recipeRevision, value.result.change.afterRevision);
            browser.assert.strictEqual(value.result.change.beforeRevision + 1, value.recipeRevision);
            browser.assert.strictEqual(value.result.change.actor, "agent");
            browser.assert.strictEqual(value.result.change.source, "webmcp");
            browser.assert.strictEqual(value.stepIds[0], value.focusedStepId);
            browser.assert.strictEqual(value.focusedArgumentIndex, 0);
            browser.assert.strictEqual(value.config[0].args[0], "A-Za-z0-9-_");
            browser.assert.strictEqual(value.config[2].op, "To Hex");
            browser.assert.strictEqual(value.bakeIdAfter, value.bakeIdBefore);
            browser.assert.strictEqual(value.outputStatuses.every(status => status === "stale"), true);
            browser.assert.strictEqual(value.staleVisible, true);
            browser.assert.strictEqual(value.eventCount, 1);
            browser.assert.deepStrictEqual(value.event, value.result.change);
            browser.assert.strictEqual(
                value.ingredientHandlerCountAfter,
                value.ingredientHandlerCountBefore
            );
            browser.assert.strictEqual(value.firstStepCollapsed, true);
            browser.assert.strictEqual(value.urlContainsRuntimeId, false);
        });
    },

    "User Revert rejects an active Bake": browser => {
        browser.execute(() => {
            const app = window.app,
                recipe = app.manager.recipe,
                before = recipe.getReadProjection(),
                beforeConfig = recipe.getConfig(),
                revertStateBefore = recipe.getAgentRevertState();
            let errorCode = null;

            app.baking = true;
            try {
                recipe.revertAgentPatch();
            } catch (err) {
                errorCode = err.code;
            } finally {
                app.baking = false;
            }

            return {
                errorCode,
                beforeRevision: before.recipeRevision,
                afterRevision: recipe.getRecipeRevision(),
                beforeConfig,
                afterConfig: recipe.getConfig(),
                revertStateBefore,
                revertStateAfter: recipe.getAgentRevertState(),
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.errorCode, "BAKE_BUSY");
            browser.assert.strictEqual(value.afterRevision, value.beforeRevision);
            browser.assert.deepStrictEqual(value.afterConfig, value.beforeConfig);
            browser.assert.deepStrictEqual(value.revertStateAfter, value.revertStateBefore);
        });
    },

    "User Revert skips normal Auto Bake": browser => {
        browser.execute(() => {
            const app = window.app,
                recipe = app.manager.recipe,
                agentRecord = window.__agentRecipeTransaction,
                revertStateBefore = recipe.getAgentRevertState(),
                bakeId = app.manager.worker.bakeId;

            window.__revertRecipeEvents = [];
            const recipeChangeHandler = event => {
                window.__revertRecipeEvents.push(event.detail);
            };
            window.addEventListener("recipechange", recipeChangeHandler);

            let result;
            try {
                result = recipe.revertAgentPatch();
            } finally {
                window.removeEventListener("recipechange", recipeChangeHandler);
            }
            let secondErrorCode = null;
            try {
                recipe.revertAgentPatch();
            } catch (err) {
                secondErrorCode = err.code;
            }
            window.__revertRecipeTransaction = {
                result,
                revertStateBefore,
                revertStateAfter: recipe.getAgentRevertState(),
                bakeId,
                secondErrorCode,
                firstStepId: agentRecord.firstStepId,
                secondStepId: agentRecord.secondStepId,
            };
        });

        browser.pause(100).execute(() => {
            const app = window.app,
                recipe = app.manager.recipe,
                record = window.__revertRecipeTransaction,
                projection = recipe.getReadProjection();
            return {
                ...record,
                recipeRevision: projection.recipeRevision,
                stepIds: projection.steps.map(step => step.stepId),
                config: recipe.getConfig(),
                bakeIdAfter: app.manager.worker.bakeId,
                outputStatuses: Object.values(app.manager.output.outputs).map(output => output.status),
                eventCount: window.__revertRecipeEvents.length,
                event: window.__revertRecipeEvents[0],
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.revertStateBefore.available, true);
            browser.assert.strictEqual(value.result.status, "committed");
            browser.assert.strictEqual(value.result.change.actor, "user");
            browser.assert.strictEqual(value.result.change.source, "revert");
            browser.assert.strictEqual(value.result.change.afterRevision, value.recipeRevision);
            browser.assert.deepStrictEqual(value.stepIds, [value.firstStepId, value.secondStepId]);
            browser.assert.deepStrictEqual(value.config, [
                {op: "To Base64", args: ["A-Za-z0-9+/="]},
                {op: "To Base64", args: ["A-Za-z0-9+/="]},
            ]);
            browser.assert.strictEqual(value.bakeIdAfter, value.bakeId);
            browser.assert.strictEqual(value.outputStatuses.every(status => status === "stale"), true);
            browser.assert.strictEqual(value.eventCount, 1);
            browser.assert.deepStrictEqual(value.event, value.result.change);
            browser.assert.strictEqual(value.revertStateAfter.available, false);
            browser.assert.strictEqual(value.revertStateAfter.reason, "ALREADY_USED");
            browser.assert.strictEqual(value.secondErrorCode, "REVERT_UNAVAILABLE");
        });

        browser.execute(() => {
            const recipe = window.app.manager.recipe,
                projection = recipe.getReadProjection(),
                result = recipe.applyAgentPatch({
                    expectedRevision: projection.recipeRevision,
                    changes: projection.steps.map(step => ({type: "remove", stepId: step.stepId})),
                }),
                ingredientHandlerCount = Object.values(window.app.manager.dynamicHandlers)
                    .flat()
                    .filter(handler => handler.scope?.dynamicHandlerGroup === "recipeIngredient")
                    .length;
            return {
                result,
                stepCount: recipe.getReadProjection().steps.length,
                ingredientHandlerCount,
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.result.status, "committed");
            browser.assert.strictEqual(value.stepCount, 0);
            browser.assert.strictEqual(value.ingredientHandlerCount, 0);
        });
    },

    "Agent Auto Bake runs one safe active target": browser => {
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager,
                recipe = manager.recipe,
                input = manager.input,
                inputNum = manager.tabs.getActiveTab("input"),
                view = input.inputEditorView,
                originalAgentAutoBakeEnabled = recipe.agentAutoBakeEnabled;
            try {
                manager.controls.setAutoBake(false);
                recipe.agentAutoBakeEnabled = true;
                app.setRecipeConfig([{
                    op: "To Base64",
                    args: ["A-Za-z0-9+/="],
                }]);
                view.dispatch({
                    changes: {
                        from: 0,
                        to: view.state.doc.length,
                        insert: "Agent Auto Bake",
                    },
                });
                const synchronizedInput = await input.flushActiveInput(),
                    before = recipe.getReadProjection(),
                    stepId = before.steps[0].stepId,
                    bakeIdBefore = manager.worker.bakeId,
                    createApplicationWork = () => {
                        const controller = new AbortController();
                        return {
                            signal: controller.signal,
                            close: () => {},
                        };
                    };

                manager.controls.setAutoBake(true);
                const result = recipe.applyAgentPatch({
                    expectedRevision: before.recipeRevision,
                    changes: [{
                        type: "setArgument",
                        stepId,
                        argumentIndex: 0,
                        value: "A-Za-z0-9-_",
                    }],
                }, createApplicationWork);

                const deadline = Date.now() + 10000;
                while (manager.output.outputs[inputNum].status !== "baked" &&
                    Date.now() < deadline) {
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
                const bakeIdAfter = manager.worker.bakeId,
                    run = manager.runs.getRun(bakeIdAfter),
                    outputFresh = manager.output.outputIsFresh(inputNum);

                manager.controls.setAutoBake(false);
                const second = recipe.applyAgentPatch({
                    expectedRevision: result.recipeRevision,
                    changes: [{
                        type: "setArgument",
                        stepId,
                        argumentIndex: 0,
                        value: "A-Za-z0-9+/=",
                    }],
                }, createApplicationWork);
                await new Promise(resolve => setTimeout(resolve, 100));
                const bakeIdBeforeRace = manager.worker.bakeId;

                manager.controls.setAutoBake(true);
                window.addEventListener("recipechange", () => {
                    manager.controls.setAutoBake(false);
                    app.setRecipeConfig([{
                        op: "To Hex",
                        args: ["Space", 0],
                    }]);
                }, {once: true});
                const raced = recipe.applyAgentPatch({
                    expectedRevision: second.recipeRevision,
                    changes: [{
                        type: "setArgument",
                        stepId,
                        argumentIndex: 0,
                        value: "A-Za-z0-9-_",
                    }],
                }, createApplicationWork);
                await new Promise(resolve => setTimeout(resolve, 100));

                done({
                    synchronizedInput,
                    result,
                    second,
                    bakeIdBefore,
                    bakeIdAfter,
                    bakeIdFinal: manager.worker.bakeId,
                    run,
                    outputFresh,
                    outputStatus: manager.output.outputs[inputNum].status,
                    raced,
                    bakeIdBeforeRace,
                    bakeIdAfterRace: manager.worker.bakeId,
                    finalRecipe: recipe.getConfig(),
                    finalRevision: recipe.getRecipeRevision(),
                    targetContainsByteLength: Object.prototype.hasOwnProperty.call(
                        run?.target?.inputTargets?.[0] ?? {},
                        "inputByteLength"
                    ),
                });
            } catch (err) {
                done({error: err?.stack ?? err?.message ?? String(err)});
            } finally {
                recipe.agentAutoBakeEnabled = originalAgentAutoBakeEnabled;
                manager.controls.setAutoBake(false);
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.error, undefined);
            browser.assert.strictEqual(value.synchronizedInput.inputByteLength, 15);
            browser.assert.strictEqual(value.result.status, "committed");
            browser.assert.strictEqual(value.bakeIdAfter, value.bakeIdBefore + 1);
            browser.assert.strictEqual(value.run.owner, "agent");
            browser.assert.strictEqual(value.run.mode, "agent");
            browser.assert.strictEqual(value.run.terminalState, "completed");
            browser.assert.strictEqual(value.run.target.recipeRevisionAtStart, value.result.recipeRevision);
            browser.assert.strictEqual(value.run.target.inputTargets.length, 1);
            browser.assert.strictEqual(value.outputFresh, true);
            browser.assert.strictEqual(value.targetContainsByteLength, false);
            browser.assert.strictEqual(value.second.status, "committed");
            browser.assert.strictEqual(value.bakeIdFinal, value.bakeIdAfter);
            browser.assert.strictEqual(value.outputStatus, "stale");
            browser.assert.strictEqual(value.raced.status, "committed");
            browser.assert.strictEqual(value.bakeIdAfterRace, value.bakeIdBeforeRace);
            browser.assert.strictEqual(value.finalRevision, value.raced.recipeRevision + 1);
            browser.assert.deepStrictEqual(value.finalRecipe, [{op: "To Hex", args: ["Space", 0]}]);
        });
    },

    "Recipe changes discard a running Bake result": browser => {
        browser.execute(() => {
            const app = window.app,
                worker = app.manager.worker;
            app.manager.controls.setAutoBake(false);
            app.setRecipeConfig([{op: "Sleep", args: [500]}]);
            worker.cancelBake(true, false);

            const inputNum = app.manager.tabs.getActiveTab("output"),
                workerIndex = worker.getInactiveChefWorker(true),
                output = app.manager.output.outputs[inputNum],
                target = worker.captureWorkspaceTarget({
                    nums: [inputNum],
                    inputStates: [app.manager.input.getSynchronizedInputState(inputNum)],
                    source: "manual",
                    progress: 0,
                    step: false,
                });
            window.__staleRecipeRun = {
                previousOutputData: output.data,
                previousOutputText: app.manager.output.outputEditorView.state.doc.toString(),
            };
            worker.totalOutputs = 1;
            worker.bake(app.getRecipeConfig(), target);
            worker.inputs.push({
                input: "old Recipe result",
                inputNum,
                progress: false,
            });
            worker.bakeNextInput(workerIndex);
        });

        browser.execute(() => {
            const app = window.app,
                worker = app.manager.worker,
                recipe = app.manager.recipe,
                target = worker.bakeTarget;

            document.querySelector("#rec-list .disable-icon").click();
            Object.assign(window.__staleRecipeRun, {
                bakeId: target.bakeId,
                recipeRevisionAtStart: target.recipeRevisionAtStart,
                currentRecipeRevision: recipe.getRecipeRevision(),
            });
        });

        browser.pause(1000);

        browser.execute(() => {
            const app = window.app,
                worker = app.manager.worker,
                recipe = app.manager.recipe,
                output = app.manager.output.outputs[app.manager.tabs.getActiveTab("output")],
                record = window.__staleRecipeRun;
            return {
                ...record,
                finalRecipeRevision: recipe.getRecipeRevision(),
                outputStatus: output.status,
                outputBakeId: output.bakeId,
                outputRecipeRevision: output.recipeRevision,
                outputTerminalState: output.provenance?.terminalState ?? null,
                outputIsFresh: app.manager.output.outputIsFresh(output.inputNum),
                outputDataUnchanged: output.data === record.previousOutputData,
                outputText: app.manager.output.outputEditorView.state.doc.toString(),
                staleVisible: !document.getElementById("stale-indicator").classList.contains("hidden"),
                bakeTarget: worker.bakeTarget,
                activeRunCount: worker.chefWorkers.filter(item => item.active || item.runTarget).length,
                terminalState: app.manager.runs.getRun(record.bakeId)?.terminalState ?? null,
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.currentRecipeRevision, value.recipeRevisionAtStart + 1);
            browser.assert.strictEqual(value.finalRecipeRevision, value.currentRecipeRevision);
            browser.assert.strictEqual(value.outputStatus, "stale");
            browser.assert.strictEqual(value.outputBakeId, value.bakeId);
            browser.assert.strictEqual(value.outputRecipeRevision, value.recipeRevisionAtStart);
            browser.assert.strictEqual(value.outputTerminalState, "superseded");
            browser.assert.strictEqual(value.outputIsFresh, false);
            browser.assert.strictEqual(value.outputDataUnchanged, true);
            browser.assert.strictEqual(value.outputText, value.previousOutputText);
            browser.assert.strictEqual(value.staleVisible, true);
            browser.assert.strictEqual(value.bakeTarget, null);
            browser.assert.strictEqual(value.activeRunCount, 0);
            browser.assert.strictEqual(value.terminalState, "superseded");
        });
    },

    "Output render generation rejects a stale presentation": browser => {
        browser.execute(() => {
            const app = window.app,
                outputWaiter = app.manager.output,
                recipe = app.manager.recipe,
                inputNum = app.manager.tabs.getActiveTab("output");

            outputWaiter.outputEditorView.dispatch({
                changes: {
                    from: 0,
                    to: outputWaiter.outputEditorView.state.doc.length,
                    insert: "current display",
                }
            });
            outputWaiter.updateOutputBakeTarget(
                app.manager.worker.bakeId,
                recipe.getRecipeRevision(),
                inputNum
            );
            outputWaiter.updateOutputValue({
                result: "late stale display",
                type: "string",
                duration: 0,
            }, inputNum, false);
            outputWaiter.updateOutputStatus("baked", inputNum);

            document.querySelector("#rec-list .breakpoint").click();
            window.__staleOutputRender = {
                inputNum,
                currentRecipeRevision: recipe.getRecipeRevision(),
            };
        });

        browser.pause(100).execute(() => {
            const app = window.app,
                record = window.__staleOutputRender,
                outputWaiter = app.manager.output;
            return {
                outputText: outputWaiter.outputEditorView.state.doc.toString(),
                outputStatus: outputWaiter.outputs[record.inputNum].status,
                staleVisible: !document.getElementById("stale-indicator").classList.contains("hidden"),
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.outputText, "current display");
            browser.assert.strictEqual(value.outputStatus, "stale");
            browser.assert.strictEqual(value.staleVisible, true);
        });

        browser.execute(() => {
            const app = window.app,
                record = window.__staleOutputRender,
                manager = app.manager,
                outputWaiter = manager.output,
                target = app.manager.worker.captureWorkspaceTarget({
                    nums: [record.inputNum],
                    inputStates: [manager.input.getSynchronizedInputState(record.inputNum)],
                    source: "manual",
                    progress: 0,
                    step: false,
                }),
                request = manager.runs.ensure(target, {
                    owner: "user",
                    mode: "manual",
                    reuseFresh: false,
                }),
                outcome = {state: "completed"};
            outputWaiter.bindRunTarget(request.run.target);
            outputWaiter.settleRunTarget(request.run.target, record.inputNum, outcome);
            manager.runs.settleInput(request.run.bakeId, record.inputNum, outcome);
            outputWaiter.updateOutputStatus("baked", record.inputNum, request.run.target);
        });

        browser.pause(100).execute(() => {
            const app = window.app;
            return {
                outputText: app.manager.output.outputEditorView.state.doc.toString(),
                staleVisible: !document.getElementById("stale-indicator").classList.contains("hidden"),
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.outputText, "late stale display");
            browser.assert.strictEqual(value.staleVisible, false);
        });
    },

    "Output loader survives a new request during cleanup": browser => {
        browser.executeAsync(async done => {
            const output = window.app.manager.output,
                loader = document.getElementById("output-loader"),
                animation = document.getElementById("output-loader-animation"),
                wait = delay => new Promise(resolve => setTimeout(resolve, delay));

            output.toggleLoader(false);
            await wait(550);
            output.toggleLoader(true);
            await wait(250);
            output.toggleLoader(false);
            output.toggleLoader(true);
            await wait(250);

            const duringNewRequest = {
                visible: loader.style.visibility === "visible",
                opaque: loader.style.opacity === "1",
                animationAttached: animation.contains(output.bombeEl),
            };

            output.toggleLoader(false);
            await wait(550);
            done({
                duringNewRequest,
                animationRemoved: !animation.contains(output.bombeEl),
            });
        }, [], ({value}) => {
            browser.assert.deepStrictEqual(value.duringNewRequest, {
                visible: true,
                opaque: true,
                animationAttached: true,
            });
            browser.assert.strictEqual(value.animationRemoved, true);
        });
    },

    "Background Magic stays bound to a fresh Output": browser => {
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager,
                outputWaiter = manager.output,
                inputNum = manager.tabs.getActiveTab("output"),
                output = outputWaiter.outputs[inputNum],
                suggestion = [{
                    recipe: [{op: "To Hex", args: ["Space", 0]}],
                    data: "suggested output",
                }],
                bindOutput = state => {
                    const target = manager.worker.captureWorkspaceTarget({
                            nums: [inputNum],
                            inputStates: [manager.input.getSynchronizedInputState(inputNum)],
                            source: "manual",
                            progress: 0,
                            step: false,
                        }),
                        request = manager.runs.ensure(target, {
                            owner: "user",
                            mode: "manual",
                            reuseFresh: false,
                        }),
                        outcome = {state};
                    outputWaiter.bindRunTarget(request.run.target);
                    outputWaiter.settleRunTarget(request.run.target, inputNum, outcome);
                    manager.runs.settleInput(request.run.bakeId, inputNum, outcome);
                    output.status = state === "completed" ? "baked" : "stale";
                    return output.provenance;
                },
                originalGetDishBuffer = outputWaiter.getDishBuffer,
                originalMagic = manager.background.magic,
                originalAutoMagic = app.options.autoMagic;

            const firstProvenance = bindOutput("completed");
            output.data = {dish: {}};
            let dispatchedProvenance = null;
            outputWaiter.getDishBuffer = async () => new Uint8Array([65]).buffer;
            manager.background.magic = (sample, provenance) => {
                dispatchedProvenance = provenance;
                return {
                    completion: Promise.resolve({
                        analysis: {terminalState: "noSuggestion"},
                        value: null,
                    }),
                };
            };
            app.options.autoMagic = true;
            await outputWaiter.backgroundMagic();
            outputWaiter.getDishBuffer = originalGetDishBuffer;
            manager.background.magic = originalMagic;
            app.options.autoMagic = originalAutoMagic;

            outputWaiter.backgroundMagicResult(suggestion, firstProvenance);
            const currentResultVisible = !document.getElementById("magic").classList.contains("hidden");
            outputWaiter.hideMagicButton();
            outputWaiter.getDishBuffer = async () =>
                new TextEncoder().encode("dGVzdA==").buffer;
            app.options.autoMagic = true;
            await outputWaiter.backgroundMagic();
            outputWaiter.getDishBuffer = originalGetDishBuffer;
            app.options.autoMagic = originalAutoMagic;
            const workerResultVisible = !document.getElementById("magic").classList.contains("hidden"),
                workerRequestSettled = manager.background.activeAnalysis === null &&
                    manager.background.callbacks.size === 0,
                secondProvenance = bindOutput("completed");
            outputWaiter.hideMagicButton();
            outputWaiter.backgroundMagicResult(suggestion, firstProvenance);
            const staleResultVisible = !document.getElementById("magic").classList.contains("hidden");

            outputWaiter.backgroundMagicResult(suggestion, secondProvenance);
            const recipeBeforeStaleClick = JSON.stringify(app.getRecipeConfig());
            bindOutput("superseded");
            outputWaiter.magicClick();
            const lifecycleProvenance = bindOutput("completed"),
                staleRequest = manager.analyses.ensure(lifecycleProvenance, {
                    owner: "ui",
                    timeoutMs: 0,
                });
            manager.background.activeAnalysis = {
                analysisId: staleRequest.analysis.analysisId,
                workerRequestId: Number.MAX_SAFE_INTEGER,
                provenance: lifecycleProvenance,
            };
            manager.analyses.markRunning(staleRequest.analysis.analysisId);
            outputWaiter.markRecipeStale();
            const staleLifecycleState = (await staleRequest.completion).analysis.terminalState;

            const failureProvenance = bindOutput("completed"),
                failureRequest = manager.analyses.ensure(failureProvenance, {
                    owner: "ui",
                    timeoutMs: 0,
                });
            manager.background.activeAnalysis = {
                analysisId: failureRequest.analysis.analysisId,
                workerRequestId: Number.MAX_SAFE_INTEGER,
                provenance: failureProvenance,
            };
            manager.analyses.markRunning(failureRequest.analysis.analysisId);
            manager.background.handleChefFailure();
            const failureLifecycleState = (await failureRequest.completion).analysis.terminalState;

            const timeoutProvenance = bindOutput("completed"),
                timeoutRequest = manager.analyses.ensure(timeoutProvenance, {
                    owner: "ui",
                    timeoutMs: 20,
                });
            manager.background.activeAnalysis = {
                analysisId: timeoutRequest.analysis.analysisId,
                workerRequestId: Number.MAX_SAFE_INTEGER,
                provenance: timeoutProvenance,
            };
            manager.analyses.markRunning(timeoutRequest.analysis.analysisId);
            const timeoutLifecycleState = (await timeoutRequest.completion).analysis.terminalState,
                analysisAdapterSettled = manager.background.activeAnalysis === null;
            done({
                dispatchBound: dispatchedProvenance === firstProvenance,
                currentResultVisible,
                workerResultVisible,
                workerRequestSettled,
                staleResultVisible,
                staleClickChangedRecipe: JSON.stringify(app.getRecipeConfig()) !== recipeBeforeStaleClick,
                magicHiddenAfterStaleClick: document.getElementById("magic").classList.contains("hidden"),
                staleLifecycleState,
                failureLifecycleState,
                timeoutLifecycleState,
                analysisAdapterSettled,
            });
        }, [], ({value}) => {
            browser.assert.strictEqual(value.dispatchBound, true);
            browser.assert.strictEqual(value.currentResultVisible, true);
            browser.assert.strictEqual(value.workerResultVisible, true);
            browser.assert.strictEqual(value.workerRequestSettled, true);
            browser.assert.strictEqual(value.staleResultVisible, false);
            browser.assert.strictEqual(value.staleClickChangedRecipe, false);
            browser.assert.strictEqual(value.magicHiddenAfterStaleClick, true);
            browser.assert.strictEqual(value.staleLifecycleState, "stale");
            browser.assert.strictEqual(value.failureLifecycleState, "failed");
            browser.assert.strictEqual(value.timeoutLifecycleState, "timedOut");
            browser.assert.strictEqual(value.analysisAdapterSettled, true);
        });
    },

    "Background Worker failure replaces only the current Worker": browser => {
        browser.execute(() => {
            const background = window.app.manager.background,
                failedWorker = background.chefWorker;
            background.handleChefFailure(failedWorker);
            const replacement = background.chefWorker;
            background.handleChefFailure(failedWorker);
            return {
                replaced: replacement !== failedWorker,
                staleFailureIgnored: background.chefWorker === replacement,
                callbacksCleared: background.callbacks.size === 0,
                analysisIdle: background.activeAnalysis === null,
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.replaced, true);
            browser.assert.strictEqual(value.staleFailureIgnored, true);
            browser.assert.strictEqual(value.callbacksCleared, true);
            browser.assert.strictEqual(value.analysisIdle, true);
        });
    },

    "Silent Bake reaches its terminal state": browser => {
        browser.execute(() => {
            const app = window.app,
                worker = app.manager.worker,
                inputNum = app.manager.tabs.getActiveTab("output");
            worker.silentBake([{op: "Sleep", args: [50]}]);
            const workerState = worker.chefWorkers.find(item => item.silentTarget);
            window.__silentBakeRun = {
                silentBakeId: workerState?.silentTarget?.silentBakeId ?? null,
                bakeId: workerState?.silentTarget?.bakeId ?? null,
                recipeRevisionAtStart: workerState?.silentTarget?.recipeRevisionAtStart ?? null,
                output: app.manager.output.outputs[inputNum],
                outputText: app.manager.output.outputEditorView.state.doc.toString(),
            };
            return {
                active: workerState?.active ?? false,
                silentBakeId: window.__silentBakeRun.silentBakeId,
                recipeRevisionAtStart: window.__silentBakeRun.recipeRevisionAtStart,
                currentRecipeRevision: app.manager.recipe.getRecipeRevision(),
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.active, true);
            browser.assert.notStrictEqual(value.silentBakeId, null);
            browser.assert.strictEqual(
                value.recipeRevisionAtStart,
                value.currentRecipeRevision
            );
        });

        browser.pause(300).execute(() => {
            const app = window.app,
                worker = app.manager.worker,
                record = window.__silentBakeRun,
                inputNum = app.manager.tabs.getActiveTab("output");
            return {
                pending: worker.chefWorkers.some(item =>
                    item.silentTarget?.silentBakeId === record.silentBakeId
                ),
                active: worker.chefWorkers.some(item => item.active && item.silentTarget),
                outputUnchanged: app.manager.output.outputs[inputNum] === record.output,
                outputText: app.manager.output.outputEditorView.state.doc.toString(),
                previousOutputText: record.outputText,
                terminalState: app.manager.runs.getRun(record.bakeId)?.terminalState ?? null,
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.pending, false);
            browser.assert.strictEqual(value.active, false);
            browser.assert.strictEqual(value.outputUnchanged, true);
            browser.assert.strictEqual(value.outputText, value.previousOutputText);
            browser.assert.strictEqual(value.terminalState, "completed");
        });
    },

    "Silent Bake failure releases its Worker": browser => {
        browser.execute(() => {
            const manager = window.app.manager,
                worker = manager.worker;
            worker.silentBake([{op: "Sleep", args: [500]}]);
            const workerState = worker.chefWorkers.find(item => item.silentTarget),
                target = workerState?.silentTarget;
            if (!workerState || !target) return {setupFailed: true};

            worker.handleChefMessage({
                data: {
                    action: "silentBakeError",
                    data: {
                        silentBakeId: target.silentBakeId,
                        bakeId: target.bakeId,
                        recipeRevisionAtStart: target.recipeRevisionAtStart,
                    },
                },
            }, workerState);
            const run = manager.runs.getRun(target.bakeId);
            return {
                setupFailed: false,
                workerRemoved: !worker.chefWorkers.includes(workerState),
                terminalState: run?.terminalState ?? null,
                failureKind: run?.failureKind ?? null,
                replacementAvailable: worker.chefWorkers.some(item => !item.active),
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.setupFailed, false);
            browser.assert.strictEqual(value.workerRemoved, true);
            browser.assert.strictEqual(value.terminalState, "failed");
            browser.assert.strictEqual(value.failureKind, "fatal");
            browser.assert.strictEqual(value.replacementAvailable, true);
        });
    },

    after: browser => {
        browser.end();
    }
};
