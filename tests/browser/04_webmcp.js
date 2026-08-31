/**
 * Tests the visible WebMCP Recipe access controls.
 *
 * @license Apache-2.0
 */

let initialSessionState;


module.exports = {
    before: browser => {
        browser
            .resizeWindow(1280, 1000)
            .url(browser.launchUrl)
            .useCss()
            .waitForElementNotPresent("#preloader", 10000)
            .execute(() => {
                window.__invokeWebMCPTool = async (tool, input) => {
                    let result;
                    try {
                        result = await document.modelContext.executeTool(
                            tool,
                            JSON.stringify(input)
                        );
                    } catch (err) {
                        if (!(err instanceof TypeError)) throw err;
                        result = await document.modelContext.executeTool(tool, input);
                    }
                    return typeof result === "string" ? JSON.parse(result) : result;
                };

            });
    },

    "Recipe access exposes explicit and accessible controls": browser => {
        browser.execute(() => ({
            providerAvailable: Boolean(document.modelContext),
            getToolsAvailable: typeof document.modelContext?.getTools === "function",
            executeToolAvailable: typeof document.modelContext?.executeTool === "function",
            panelHidden: document.getElementById("webmcp-collaboration").hidden,
            profileName: window.app.manager.webmcp.buildProfile.name,
            toolNames: window.app.manager.webmcp.buildProfile.toolNames,
            url: window.location.href,
            storageKeys: Object.keys(window.localStorage),
        }), [], ({value}) => {
            browser.assert.strictEqual(value.providerAvailable, true);
            browser.assert.strictEqual(value.getToolsAvailable, true);
            browser.assert.strictEqual(value.executeToolAvailable, true);
            browser.assert.strictEqual(value.panelHidden, false);
            browser.assert.strictEqual(value.profileName, "analysis");
            browser.assert.deepStrictEqual(value.toolNames, [
                "search_operations",
                "get_operation_details",
                "get_recipe_state",
                "apply_recipe_patch",
                "bake_recipe",
                "inspect_output",
            ]);
            initialSessionState = value;
        });

        browser.expect.element("#webmcp-collaboration").to.be.visible;
        browser.expect.element("#webmcp-heading").text.to.equal("WebMCP Recipe access");
        browser.expect.element("#webmcp-tool-list").text.to.contain("apply_recipe_patch");
        browser.expect.element("#webmcp-tool-list").text.to.contain("bake_recipe");
        browser.expect.element("#webmcp-tool-list").text.to.contain("inspect_output");
        browser.expect.element("#webmcp-profile-summary").text.to.contain(
            "bounded Output-derived analysis"
        );
        browser.expect.element("#webmcp-start").attribute("aria-label")
            .to.equal("Start WebMCP Recipe access");
        browser.expect.element("#webmcp-revert").attribute("aria-describedby")
            .to.equal("webmcp-revert-state");
        browser.expect.element("#webmcp-live-status").attribute("role").to.equal("status");

        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.expect.element("#webmcp-session-state").text.to.equal("Active");
        browser.expect.element("#webmcp-stop").to.be.visible;
        browser.expect.element("#webmcp-live-status").text.to.equal(
            "WebMCP Recipe access started."
        );
        browser.execute(() => document.activeElement.id, [], ({value}) => {
            browser.assert.strictEqual(value, "webmcp-stop");
        });

        browser.sendKeys("#webmcp-stop", browser.Keys.ENTER);
        browser.expect.element("#webmcp-session-state").text.to.equal("Off");
        browser.expect.element("#webmcp-start").to.be.visible;
        browser.expect.element("#webmcp-live-status").text.to.equal(
            "WebMCP Recipe access stopped. Existing Recipe changes remain."
        );
        browser.execute(() => ({
            activeElementId: document.activeElement.id,
            url: window.location.href,
            storageKeys: Object.keys(window.localStorage),
        }), [], ({value}) => {
            browser.assert.strictEqual(value.activeElementId, "webmcp-start");
            browser.assert.strictEqual(value.url, initialSessionState.url);
            browser.assert.deepStrictEqual(value.storageKeys, initialSessionState.storageKeys);
        });
    },

    "Recipe tools support a real discovery and collaboration flow": browser => {
        browser.executeAsync(async done => {
            try {
                const tools = await document.modelContext.getTools(),
                    names = tools.map(tool => tool.name),
                    searchTool = tools.find(tool => tool.name === "search_operations"),
                    detailsTool = tools.find(tool => tool.name === "get_operation_details"),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    search = await window.__invokeWebMCPTool(searchTool, {
                        query: "base64",
                        limit: 2,
                        offset: 0,
                    }),
                    details = await window.__invokeWebMCPTool(detailsTool, {
                        name: "To Base64",
                        argumentOffset: 0,
                        argumentLimit: 1,
                        optionOffset: 0,
                        optionLimit: 2,
                    }),
                    protectedState = await window.__invokeWebMCPTool(stateTool, {});
                done({names, search, details, protectedState});
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.deepStrictEqual(value.names, [
                "apply_recipe_patch",
                "bake_recipe",
                "get_operation_details",
                "get_recipe_state",
                "inspect_output",
                "search_operations",
            ]);
            browser.assert.strictEqual(value.search.ok, true);
            browser.assert.strictEqual(value.search.data.items[0].name, "To Base64");
            browser.assert.strictEqual(value.details.ok, true);
            browser.assert.strictEqual(value.details.data.name, "To Base64");
            browser.assert.strictEqual(value.details.data.arguments.length, 1);
            browser.assert.strictEqual(
                value.protectedState.error.code,
                "COLLABORATION_DISABLED"
            );
        });

        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager,
                inputCanary = "SECRET_INPUT_CANARY",
                outputCanary = "U0VDUkVUX0lOUFVUX0NBTkFSWQ==";
            try {
                manager.controls.setAutoBake(false);
                app.setRecipeConfig([]);
                const inputView = manager.input.inputEditorView;
                inputView.dispatch({
                    changes: {
                        from: 0,
                        to: inputView.state.doc.length,
                        insert: inputCanary,
                    },
                });
                await manager.input.flushActiveInputForBake();
                manager.controls.setAutoBake(true);

                const tools = await document.modelContext.getTools(),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    patchTool = tools.find(tool => tool.name === "apply_recipe_patch"),
                    bakeTool = tools.find(tool => tool.name === "bake_recipe"),
                    inspectTool = tools.find(tool => tool.name === "inspect_output"),
                    state = await window.__invokeWebMCPTool(stateTool, {}),
                    bakeIdBefore = manager.worker.bakeId,
                    patch = await window.__invokeWebMCPTool(patchTool, {
                        expectedRevision: state.state.recipeRevision,
                        changes: [{type: "insert", operation: "To Base64"}],
                    }),
                    bakeIdAfterPatch = manager.worker.bakeId,
                    bake = await window.__invokeWebMCPTool(bakeTool, {
                        expectedRevision: patch.state.recipeRevision,
                    }),
                    inspection = await window.__invokeWebMCPTool(inspectTool, {
                        bakeId: bake.state.bakeId,
                    }),
                    outputNum = manager.tabs.getActiveTab("output");

                done({
                    state,
                    patch,
                    bake,
                    inspection,
                    bakeIdBefore,
                    bakeIdAfterPatch,
                    bakeIdAfterTool: manager.worker.bakeId,
                    outputFresh: manager.output.outputIsFresh(outputNum),
                    outputText: manager.output.outputEditorView.state.doc.toString(),
                    config: manager.recipe.getConfig(),
                    panelText: document.getElementById("webmcp-collaboration").textContent,
                    bakeContainsInput: JSON.stringify(bake).includes(inputCanary),
                    bakeContainsOutput: JSON.stringify(bake).includes(outputCanary),
                    inspectionContainsInput: JSON.stringify(inspection).includes(inputCanary),
                    inspectionContainsOutput: JSON.stringify(inspection).includes(outputCanary),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            } finally {
                manager.controls.setAutoBake(false);
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.state.ok, true);
            browser.assert.strictEqual(value.state.state.executionCapability, "AGENT_BAKE_AVAILABLE");
            browser.assert.strictEqual(value.state.state.inputTabId, value.state.state.outputTabId);
            browser.assert.strictEqual(value.patch.ok, true);
            browser.assert.strictEqual(value.patch.data.status, "committed");
            browser.assert.strictEqual(value.patch.data.insertedSteps.stepIds.length, 1);
            browser.assert.strictEqual(value.bakeIdAfterPatch, value.bakeIdBefore + 1);
            browser.assert.strictEqual(value.bake.ok, true);
            browser.assert.strictEqual(
                ["joined", "alreadyFresh"].includes(value.bake.data.decision),
                true
            );
            browser.assert.strictEqual(value.bake.state.terminalState, "completed");
            browser.assert.strictEqual(value.bake.state.bakeId, value.bakeIdAfterPatch);
            browser.assert.strictEqual(value.bakeIdAfterTool, value.bakeIdAfterPatch);
            browser.assert.strictEqual(value.outputFresh, true);
            browser.assert.strictEqual(value.outputText, "U0VDUkVUX0lOUFVUX0NBTkFSWQ==");
            browser.assert.strictEqual(value.bakeContainsInput, false);
            browser.assert.strictEqual(value.bakeContainsOutput, false);
            browser.assert.strictEqual(value.inspection.ok, true);
            browser.assert.strictEqual(
                value.inspection.data.analysisState,
                "signalsReady"
            );
            browser.assert.strictEqual(
                value.inspection.data.bakeId,
                value.bake.state.bakeId
            );
            browser.assert.strictEqual(value.inspectionContainsInput, false);
            browser.assert.strictEqual(value.inspectionContainsOutput, false);
            browser.assert.strictEqual(value.config.length, 1);
            browser.assert.strictEqual(JSON.stringify(value.patch).includes("A-Za-z0-9+/="), false);
            browser.assert.strictEqual(value.panelText.includes("A-Za-z0-9+/="), false);
        });

        browser.expect.element("#webmcp-change-summary").text.to.equal(
            "Latest WebMCP change: Added To Base64."
        );
        browser.expect.element(".webmcp-step-badge").to.be.visible;
        browser.expect.element(".webmcp-step-badge").text.to.equal("WebMCP change");
        browser.expect.element("#webmcp-revert").to.be.enabled;

        browser.sendKeys("#webmcp-revert", browser.Keys.ENTER);
        browser.expect.element("#webmcp-revert").to.not.be.enabled;
        browser.expect.element(".webmcp-step-badge").to.not.be.present;
        browser.expect.element("#webmcp-live-status").text.to.equal(
            "Latest WebMCP Recipe change restored."
        );
        browser.execute(() => ({
            activeElementId: document.activeElement.id,
            config: window.app.manager.recipe.getConfig(),
        }), [], ({value}) => {
            browser.assert.strictEqual(value.activeElementId, "webmcp-stop");
            browser.assert.deepStrictEqual(value.config, []);
        });

        browser.executeAsync(async done => {
            try {
                const tools = await document.modelContext.getTools(),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    patchTool = tools.find(tool => tool.name === "apply_recipe_patch"),
                    state = await window.__invokeWebMCPTool(stateTool, {}),
                    patch = await window.__invokeWebMCPTool(patchTool, {
                        expectedRevision: state.state.recipeRevision,
                        changes: [{type: "insert", operation: "From Hex"}],
                    }),
                    stepId = patch.data.insertedSteps.stepIds[0];

                document.querySelector(`[data-recipe-step-id="${stepId}"] .disable-icon`).click();
                const afterUserEdit = window.app.manager.recipe.getReadProjection(),
                    configBeforeStale = window.app.manager.recipe.getConfig(),
                    stale = await window.__invokeWebMCPTool(patchTool, {
                        expectedRevision: patch.state.recipeRevision,
                        changes: [{type: "remove", stepId}],
                    }),
                    afterStale = window.app.manager.recipe.getReadProjection();

                done({
                    patch,
                    stale,
                    userRevision: afterUserEdit.recipeRevision,
                    finalRevision: afterStale.recipeRevision,
                    configUnchanged: JSON.stringify(configBeforeStale) ===
                        JSON.stringify(window.app.manager.recipe.getConfig()),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.patch.ok, true);
            browser.assert.strictEqual(value.stale.error.code, "STALE_RECIPE");
            browser.assert.strictEqual(value.finalRevision, value.userRevision);
            browser.assert.strictEqual(value.configUnchanged, true);
        });
        browser.expect.element("#webmcp-revert").to.not.be.enabled;
        browser.expect.element(".webmcp-step-badge").to.not.be.present;
        browser.expect.element("#webmcp-revert-state").text.to.contain(
            "Recipe changed after the WebMCP change"
        );

        browser.sendKeys("#webmcp-stop", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            try {
                const tools = await document.modelContext.getTools(),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    state = await window.__invokeWebMCPTool(stateTool, {});
                done({state, config: window.app.manager.recipe.getConfig()});
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.state.error.code, "COLLABORATION_DISABLED");
            browser.assert.strictEqual(value.config.length, 1);
            browser.assert.strictEqual(value.config[0].op, "From Hex");
            browser.assert.strictEqual(value.config[0].disabled, true);
        });
    },

    "Output inspection follows the current completed Bake": browser => {
        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager;
            try {
                manager.controls.setAutoBake(false);
                app.setRecipeConfig([]);
                const inputView = manager.input.inputEditorView,
                    setInput = value => inputView.dispatch({
                        changes: {
                            from: 0,
                            to: inputView.state.doc.length,
                            insert: value,
                        },
                    }),
                    tools = await document.modelContext.getTools(),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    bakeTool = tools.find(tool => tool.name === "bake_recipe"),
                    inspectTool = tools.find(tool => tool.name === "inspect_output");

                setInput("48656c6c6f");
                const firstState = await window.__invokeWebMCPTool(stateTool, {}),
                    firstBake = await window.__invokeWebMCPTool(bakeTool, {
                        expectedRevision: firstState.state.recipeRevision,
                    }),
                    firstInspection = await window.__invokeWebMCPTool(inspectTool, {
                        bakeId: firstBake.state.bakeId,
                    });

                setInput("576f726c64");
                const secondBake = await window.__invokeWebMCPTool(bakeTool, {
                        expectedRevision: firstState.state.recipeRevision,
                    }),
                    staleInspection = await window.__invokeWebMCPTool(inspectTool, {
                        bakeId: firstBake.state.bakeId,
                    }),
                    secondInspection = await window.__invokeWebMCPTool(inspectTool, {
                        bakeId: secondBake.state.bakeId,
                    });

                done({
                    firstBake,
                    firstInspection,
                    secondBake,
                    staleInspection,
                    secondInspection,
                    containsFirstInput: JSON.stringify(firstInspection).includes("48656c6c6f"),
                    containsSecondInput: JSON.stringify(secondInspection).includes("576f726c64"),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            } finally {
                manager.controls.setAutoBake(false);
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.firstBake.ok, true);
            browser.assert.strictEqual(value.firstInspection.ok, true);
            browser.assert.strictEqual(value.secondBake.ok, true);
            browser.assert.strictEqual(
                value.secondBake.state.bakeId !== value.firstBake.state.bakeId,
                true
            );
            browser.assert.strictEqual(
                value.staleInspection.error.code,
                "STALE_OUTPUT_ANALYSIS"
            );
            browser.assert.strictEqual(value.secondInspection.ok, true);
            browser.assert.strictEqual(
                value.secondInspection.data.bakeId,
                value.secondBake.state.bakeId
            );
            browser.assert.strictEqual(value.containsFirstInput, false);
            browser.assert.strictEqual(value.containsSecondInput, false);
        });
        browser.sendKeys("#webmcp-stop", browser.Keys.ENTER);
    },

    "Stop cancels an exclusive Agent Run": browser => {
        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager,
                worker = manager.worker,
                inputCanary = "STOPPED_AGENT_INPUT_CANARY",
                originalRequestInput = worker.requestInputForBake;
            try {
                manager.controls.setAutoBake(false);
                app.setRecipeConfig([{op: "To Hex", args: ["Space", 0]}]);
                const inputView = manager.input.inputEditorView;
                inputView.dispatch({
                    changes: {
                        from: 0,
                        to: inputView.state.doc.length,
                        insert: inputCanary,
                    },
                });
                await manager.input.flushActiveInputForBake();

                const tools = await document.modelContext.getTools(),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    bakeTool = tools.find(tool => tool.name === "bake_recipe"),
                    state = await window.__invokeWebMCPTool(stateTool, {});
                let queueStarted;
                const queued = new Promise(resolve => {
                    queueStarted = resolve;
                });
                worker.requestInputForBake = inputNum => queueStarted(inputNum);

                const invocation = window.__invokeWebMCPTool(bakeTool, {
                    expectedRevision: state.state.recipeRevision,
                });
                await queued;
                const bakeId = worker.bakeId,
                    startedRun = manager.runs.getRun(bakeId);

                document.getElementById("webmcp-stop").click();
                const result = await invocation;
                let cancelledRun;
                for (let attempt = 0; attempt < 100; attempt++) {
                    const run = manager.runs.getRun(bakeId);
                    if (run?.terminalState === "cancelled") {
                        cancelledRun = run;
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                if (!cancelledRun) {
                    throw new Error("Timed out waiting for the cancelled Agent Run");
                }

                done({
                    result,
                    owner: startedRun.owner,
                    initialState: startedRun.state,
                    terminalState: cancelledRun.terminalState,
                    sessionState: manager.webmcp.session.getState().state,
                    baking: app.baking,
                    canaryExposed: JSON.stringify(result).includes(inputCanary),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            } finally {
                worker.requestInputForBake = originalRequestInput;
                if (app.baking) worker.cancelBake(true, false);
                manager.controls.setAutoBake(false);
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.result.error.code, "SESSION_ENDED");
            browser.assert.strictEqual(value.owner, "agent");
            browser.assert.strictEqual(value.initialState, "queued");
            browser.assert.strictEqual(value.terminalState, "cancelled");
            browser.assert.strictEqual(value.sessionState, "off");
            browser.assert.strictEqual(value.baking, false);
            browser.assert.strictEqual(value.canaryExposed, false);
        });
    },

    "Stop preserves a shared user Run": browser => {
        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager,
                worker = manager.worker,
                inputCanary = "SHARED_USER_INPUT_CANARY",
                originalRequestInput = worker.requestInputForBake,
                originalEnsure = manager.runs.ensure;
            try {
                manager.controls.setAutoBake(false);
                app.setRecipeConfig([{op: "To Base64", args: ["A-Za-z0-9+/="]}]);
                const inputView = manager.input.inputEditorView;
                inputView.dispatch({
                    changes: {
                        from: 0,
                        to: inputView.state.doc.length,
                        insert: inputCanary,
                    },
                });
                await manager.input.flushActiveInputForBake();

                let queueStarted, agentJoined;
                const queued = new Promise(resolve => {
                        queueStarted = resolve;
                    }),
                    joined = new Promise(resolve => {
                        agentJoined = resolve;
                    });
                worker.requestInputForBake = inputNum => queueStarted(inputNum);
                manager.runs.ensure = function(target, request) {
                    const result = originalEnsure.call(this, target, request);
                    if (request.owner === "agent") agentJoined(result.decision);
                    return result;
                };

                await manager.input.bakeAll();
                await queued;
                const bakeId = worker.bakeId,
                    userRun = manager.runs.getRun(bakeId),
                    tools = await document.modelContext.getTools(),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    bakeTool = tools.find(tool => tool.name === "bake_recipe"),
                    state = await window.__invokeWebMCPTool(stateTool, {}),
                    invocation = window.__invokeWebMCPTool(bakeTool, {
                        expectedRevision: state.state.recipeRevision,
                    }),
                    decision = await joined;

                document.getElementById("webmcp-stop").click();
                const result = await invocation;
                const runAfterStop = manager.runs.getRun(bakeId),
                    bakingAfterStop = app.baking;

                worker.cancelBake(true, false);
                done({
                    result,
                    decision,
                    owner: userRun.owner,
                    runStateAfterStop: runAfterStop.state,
                    terminalStateAfterStop: runAfterStop.terminalState,
                    bakingAfterStop,
                    sessionState: manager.webmcp.session.getState().state,
                    bakingAfterCleanup: app.baking,
                    canaryExposed: JSON.stringify(result).includes(inputCanary),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            } finally {
                manager.runs.ensure = originalEnsure;
                worker.requestInputForBake = originalRequestInput;
                if (app.baking) worker.cancelBake(true, false);
                manager.controls.setAutoBake(false);
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.result.error.code, "SESSION_ENDED");
            browser.assert.strictEqual(value.decision, "joined");
            browser.assert.strictEqual(value.owner, "user");
            browser.assert.strictEqual(value.runStateAfterStop, "queued");
            browser.assert.strictEqual(value.terminalStateAfterStop, null);
            browser.assert.strictEqual(value.bakingAfterStop, true);
            browser.assert.strictEqual(value.sessionState, "off");
            browser.assert.strictEqual(value.bakingAfterCleanup, false);
            browser.assert.strictEqual(value.canaryExposed, false);
        });
    },

    after: browser => {
        browser.end();
    },
};
