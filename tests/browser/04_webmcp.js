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
            .waitForElementNotPresent("#preloader", 10000);
    },

    beforeEach: browser => {
        browser.execute(() => {
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

    "Recipe access resets on reload and remains page scoped": async browser => {
        const originalHandle = await browser.window.getHandle();

        await browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        const originalSession = await browser.execute(() =>
            window.app.manager.webmcp.session.getState().state
        );
        browser.assert.strictEqual(originalSession, "active");

        await browser.openNewWindow("tab");
        const secondaryHandle = await browser.window.getHandle();
        await browser.url(browser.launchUrl);
        await browser.waitForElementNotPresent("#preloader", 10000);

        const secondaryInitial = await browser.executeAsync(async done => {
            try {
                const tools = await document.modelContext.getTools();
                done({
                    sessionState: window.app.manager.webmcp.session.getState().state,
                    toolNames: tools.map(tool => tool.name).sort(),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        });
        browser.assert.strictEqual(secondaryInitial.scriptError, undefined);
        browser.assert.strictEqual(secondaryInitial.sessionState, "off");
        browser.assert.deepStrictEqual(secondaryInitial.toolNames, [
            "apply_recipe_patch",
            "bake_recipe",
            "get_operation_details",
            "get_recipe_state",
            "inspect_output",
            "search_operations",
        ]);

        await browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        const secondarySession = await browser.execute(() =>
            window.app.manager.webmcp.session.getState().state
        );
        browser.assert.strictEqual(secondarySession, "active");

        await browser.window.switchTo(originalHandle);
        const originalAfterSecondaryStart = await browser.execute(() =>
            window.app.manager.webmcp.session.getState().state
        );
        browser.assert.strictEqual(originalAfterSecondaryStart, "active");

        await browser.window.switchTo(secondaryHandle);
        await browser.closeWindow();
        await browser.window.switchTo(originalHandle);
        await browser.refresh();
        await browser.waitForElementNotPresent("#preloader", 10000);

        const refreshed = await browser.executeAsync(async done => {
            try {
                const tools = await document.modelContext.getTools();
                done({
                    sessionState: window.app.manager.webmcp.session.getState().state,
                    toolNames: tools.map(tool => tool.name).sort(),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        });
        browser.assert.strictEqual(refreshed.scriptError, undefined);
        browser.assert.strictEqual(refreshed.sessionState, "off");
        browser.assert.deepStrictEqual(refreshed.toolNames, secondaryInitial.toolNames);
    },

    "One-use approval choices remain visible and page scoped": browser => {
        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            try {
                const manager = window.app.manager,
                    sessionEpoch = manager.webmcp.session.getState().sessionEpoch,
                    request = await manager.approvals.requestApproval({
                        sessionEpoch,
                        action: {
                            expectedRevision: 7,
                            operation: "Generate HOTP",
                            args: {Secret: "APPROVAL_SECRET_CANARY", Counter: 1},
                        },
                        summary: {
                            operationNames: ["Generate HOTP"],
                            changeTypes: ["insert"],
                            sensitiveParameterNames: ["Secret"],
                            riskFlags: ["secretInput"],
                        },
                    });
                done({request, activeElementId: document.activeElement.id});
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.request.state, "pending");
            browser.assert.strictEqual(value.activeElementId, "webmcp-approval");
        });

        browser.expect.element("#webmcp-approval").to.be.visible;
        browser.expect.element("#webmcp-approval").attribute("aria-describedby")
            .to.equal("webmcp-approval-effect");
        browser.expect.element("#webmcp-approval-operations").text.to.equal(
            "Operations: Generate HOTP."
        );
        browser.expect.element("#webmcp-approval-parameters").text.to.equal(
            "Values remain hidden. Sensitive parameters: Secret."
        );
        browser.expect.element("#webmcp-approval-effect").text.to.contain(
            "Recipe-only approval leaves the current Output stale"
        );
        browser.execute(() => document.getElementById("webmcp-approval").textContent,
            [], ({value}) => {
                browser.assert.strictEqual(value.includes("APPROVAL_SECRET_CANARY"), false);
            });

        browser.sendKeys("#webmcp-approve-recipe", browser.Keys.ENTER);
        browser.execute(() => ({
            approval: window.app.manager.approvals.getState(),
            activeElementId: document.activeElement.id,
        }), [], ({value}) => {
            browser.assert.strictEqual(value.approval.state, "approved");
            browser.assert.strictEqual(value.approval.mode, "recipeOnly");
            browser.assert.strictEqual(value.activeElementId, "webmcp-stop");
        });
        browser.expect.element("#webmcp-approve-recipe").to.not.be.visible;
        browser.expect.element("#webmcp-reject-approval").text.to.equal("CANCEL APPROVAL");
        browser.expect.element("#webmcp-live-status").text.to.equal(
            "WebMCP Recipe change approved without a Bake."
        );

        browser.sendKeys("#webmcp-reject-approval", browser.Keys.ENTER);
        browser.expect.element("#webmcp-approval").to.not.be.visible;
        browser.expect.element("#webmcp-live-status").text.to.equal(
            "The WebMCP approval was cancelled."
        );

        browser.executeAsync(async done => {
            const manager = window.app.manager,
                sessionEpoch = manager.webmcp.session.getState().sessionEpoch;
            try {
                const request = await manager.approvals.requestApproval({
                    sessionEpoch,
                    action: {operation: "Generate HOTP", args: {Secret: "SECOND_CANARY"}},
                    summary: {
                        operationNames: ["Generate HOTP"],
                        changeTypes: ["insert"],
                        sensitiveParameterNames: ["Secret"],
                        riskFlags: ["secretInput"],
                    },
                });
                done({requestId: request.requestId});
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        });
        browser.sendKeys("#webmcp-approve-bake", browser.Keys.ENTER);
        browser.execute(() => window.app.manager.approvals.getState(), [], ({value}) => {
            browser.assert.strictEqual(value.state, "approved");
            browser.assert.strictEqual(value.mode, "recipeAndBake");
        });

        browser.sendKeys("#webmcp-stop", browser.Keys.ENTER);
        browser.execute(() => window.app.manager.approvals.getState(), [], ({value}) => {
            browser.assert.strictEqual(value.state, "cancelled");
            browser.assert.strictEqual(value.endReason, "sessionEnded");
        });
        browser.expect.element("#webmcp-approval").to.not.be.visible;
    },

    "Approval permits follow workspace lifecycle changes": browser => {
        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            const manager = window.app.manager,
                sessionEpoch = manager.webmcp.session.getState().sessionEpoch,
                summary = {
                    operationNames: ["Generate HOTP"],
                    changeTypes: ["insert"],
                    sensitiveParameterNames: ["Secret"],
                    riskFlags: ["secretInput"],
                },
                request = suffix => manager.approvals.requestApproval({
                    sessionEpoch,
                    action: {kind: "recipeMutation", suffix},
                    summary,
                });
            try {
                await request("input");
                window.dispatchEvent(new CustomEvent("statechange", {
                    detail: {inputNum: 1},
                }));
                const inputChange = manager.approvals.getState();

                await request("target");
                window.dispatchEvent(new CustomEvent("workspaceviewchange", {
                    detail: {viewVersion: 20},
                }));
                const targetChange = manager.approvals.getState();

                await request("recipe");
                window.dispatchEvent(new CustomEvent("recipechange", {
                    detail: {actor: "user", source: "api"},
                }));
                const recipeChange = manager.approvals.getState();

                const approved = await request("approved-agent-commit"),
                    action = {kind: "recipeMutation", suffix: "approved-agent-commit"};
                manager.approvals.approve(approved.requestId, sessionEpoch, "recipeOnly");
                await manager.approvals.consumeMutation({
                    requestId: approved.requestId,
                    sessionEpoch,
                    action,
                });
                window.dispatchEvent(new CustomEvent("recipechange", {
                    detail: {actor: "agent", source: "webmcp"},
                }));
                const approvedCommit = manager.approvals.getState();
                await manager.approvals.completeMutation({
                    requestId: approved.requestId,
                    sessionEpoch,
                    succeeded: false,
                });

                done({inputChange, targetChange, recipeChange, approvedCommit});
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.inputChange.state, "cancelled");
            browser.assert.strictEqual(value.inputChange.endReason, "inputChanged");
            browser.assert.strictEqual(value.targetChange.state, "cancelled");
            browser.assert.strictEqual(value.targetChange.endReason, "outputTargetChanged");
            browser.assert.strictEqual(value.recipeChange.state, "cancelled");
            browser.assert.strictEqual(value.recipeChange.endReason, "recipeChanged");
            browser.assert.strictEqual(value.approvedCommit.state, "mutationConsumed");
        });
        browser.sendKeys("#webmcp-stop", browser.Keys.ENTER);
    },

    "Prepared Recipe patches wait for active Bakes": browser => {
        browser.execute(() => {
            const app = window.app,
                manager = app.manager,
                recipe = manager.recipe;
            try {
                manager.controls.setAutoBake(false);
                app.setRecipeConfig([]);
                const directPatch = recipe.prepareAgentPatch({
                    expectedRevision: recipe.getRecipeRevision(),
                    changes: [{type: "insert", operation: "To Base64"}],
                });
                let directErrorCode = null,
                    approvedErrorCode = null;

                app.baking = true;
                try {
                    recipe.commitAgentPatch(directPatch);
                } catch (err) {
                    directErrorCode = err.code;
                }
                const directUnchanged = recipe.getConfig().length === 0;

                app.baking = false;
                const directResult = recipe.commitAgentPatch(directPatch),
                    approvedPatch = recipe.prepareAgentPatch({
                        expectedRevision: directResult.recipeRevision,
                        changes: [{
                            type: "insert",
                            operation: "Generate HOTP",
                            arguments: ["WebMCP account", 6, 0],
                        }],
                    });

                app.baking = true;
                try {
                    recipe.commitApprovedAgentPatch(approvedPatch, false);
                } catch (err) {
                    approvedErrorCode = err.code;
                }
                const approvedUnchanged = recipe.getConfig().length === 1;

                app.baking = false;
                recipe.commitApprovedAgentPatch(approvedPatch, false);
                return {
                    directErrorCode,
                    approvedErrorCode,
                    directUnchanged,
                    approvedUnchanged,
                    operationNames: recipe.getConfig().map(step => step.op),
                };
            } finally {
                app.baking = false;
                app.setRecipeConfig([]);
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.directErrorCode, "BAKE_BUSY");
            browser.assert.strictEqual(value.approvedErrorCode, "BAKE_BUSY");
            browser.assert.strictEqual(value.directUnchanged, true);
            browser.assert.strictEqual(value.approvedUnchanged, true);
            browser.assert.deepStrictEqual(value.operationNames, ["To Base64", "Generate HOTP"]);
        });
    },

    "Generate HOTP Recipe changes require one visible approval": browser => {
        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager,
                inputSecret = "JBSWY3DPEHPK3PXP",
                accountName = "HOTP_ACCOUNT_CANARY";
            try {
                manager.controls.setAutoBake(false);
                app.setRecipeConfig([]);
                const inputView = manager.input.inputEditorView;
                inputView.dispatch({
                    changes: {
                        from: 0,
                        to: inputView.state.doc.length,
                        insert: inputSecret,
                    },
                });
                await manager.input.flushActiveInputForBake();

                const tools = await document.modelContext.getTools(),
                    detailsTool = tools.find(tool => tool.name === "get_operation_details"),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    patchTool = tools.find(tool => tool.name === "apply_recipe_patch"),
                    details = await window.__invokeWebMCPTool(detailsTool, {
                        name: "Generate HOTP",
                    }),
                    state = await window.__invokeWebMCPTool(stateTool, {}),
                    patchInput = {
                        expectedRevision: state.state.recipeRevision,
                        changes: [{
                            type: "insert",
                            operation: "Generate HOTP",
                            arguments: [accountName, 6, 0],
                        }],
                    },
                    bakeIdBefore = manager.worker.bakeId,
                    pending = await window.__invokeWebMCPTool(patchTool, patchInput),
                    panelText = document.getElementById("webmcp-collaboration").textContent;

                window.__hotpRecipeApproval = {
                    patchInput,
                    requestId: pending.error?.approvalRequestId,
                    bakeIdBefore,
                };
                done({
                    details,
                    pending,
                    recipeEmpty: manager.recipe.getConfig().length === 0,
                    bakeUnchanged: manager.worker.bakeId === bakeIdBefore,
                    pendingContainsSecret: JSON.stringify(pending).includes(inputSecret),
                    pendingContainsAccount: JSON.stringify(pending).includes(accountName),
                    panelContainsSecret: panelText.includes(inputSecret),
                    panelContainsAccount: panelText.includes(accountName),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message, stack: err.stack}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.details.ok, true);
            browser.assert.strictEqual(value.details.data.operationAccess, "approval");
            browser.assert.strictEqual(value.details.data.mutationPolicy, "userActionRequired");
            browser.assert.strictEqual(value.details.data.agentBakePolicy, "userActionRequired");
            browser.assert.strictEqual(value.pending.error.code, "USER_ACTION_REQUIRED");
            browser.assert.strictEqual(value.pending.state.approvalState, "pending");
            browser.assert.strictEqual(value.recipeEmpty, true);
            browser.assert.strictEqual(value.bakeUnchanged, true);
            browser.assert.strictEqual(value.pendingContainsSecret, false);
            browser.assert.strictEqual(value.pendingContainsAccount, false);
            browser.assert.strictEqual(value.panelContainsSecret, false);
            browser.assert.strictEqual(value.panelContainsAccount, false);
        });

        browser.expect.element("#webmcp-approval").to.be.visible;
        browser.expect.element("#webmcp-approval-operations").text.to.equal(
            "Operations: Generate HOTP."
        );
        browser.expect.element("#webmcp-approval-parameters").text.to.equal(
            "Parameter values remain hidden."
        );
        browser.expect.element("#webmcp-approval-risks").text.to.contain(
            "process sensitive Input data"
        );
        browser.expect.element("#webmcp-approval-risks").text.to.contain(
            "produce sensitive output"
        );
        browser.sendKeys("#webmcp-approve-recipe", browser.Keys.ENTER);

        browser.executeAsync(async done => {
            const manager = window.app.manager,
                fixture = window.__hotpRecipeApproval;
            try {
                const tools = await document.modelContext.getTools(),
                    patchTool = tools.find(tool => tool.name === "apply_recipe_patch"),
                    approved = await window.__invokeWebMCPTool(patchTool, {
                        ...fixture.patchInput,
                        recipeApprovalRequestId: fixture.requestId,
                    }),
                    replay = await window.__invokeWebMCPTool(patchTool, {
                        ...fixture.patchInput,
                        recipeApprovalRequestId: fixture.requestId,
                    }),
                    config = manager.recipe.getConfig();
                done({
                    approved,
                    replay,
                    operationMatches: config.length === 1 && config[0].op === "Generate HOTP",
                    argumentsMatch: JSON.stringify(config[0]?.args) ===
                        JSON.stringify(fixture.patchInput.changes[0].arguments),
                    bakeUnchanged: manager.worker.bakeId === fixture.bakeIdBefore,
                    outputStale: !manager.output.outputIsFresh(
                        manager.tabs.getActiveTab("output")
                    ),
                    approvalState: manager.approvals.getState(),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message, stack: err.stack}});
            } finally {
                delete window.__hotpRecipeApproval;
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.approved.ok, true);
            browser.assert.strictEqual(value.approved.data.status, "committed");
            browser.assert.strictEqual(value.approved.data.approvedBakeAvailable, false);
            browser.assert.strictEqual(value.replay.error.code, "STALE_RECIPE");
            browser.assert.strictEqual(value.operationMatches, true);
            browser.assert.strictEqual(value.argumentsMatch, true);
            browser.assert.strictEqual(value.bakeUnchanged, true);
            browser.assert.strictEqual(value.outputStale, true);
            browser.assert.strictEqual(value.approvalState.state, "complete");
        });
        browser.sendKeys("#webmcp-stop", browser.Keys.ENTER);
    },

    "Generate HOTP approval permits one exact Bake with empty Input": browser => {
        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager,
                accountName = "Empty input account";
            try {
                manager.controls.setAutoBake(false);
                app.setRecipeConfig([]);
                const inputView = manager.input.inputEditorView;
                inputView.dispatch({
                    changes: {
                        from: 0,
                        to: inputView.state.doc.length,
                        insert: "",
                    },
                });
                await manager.input.flushActiveInputForBake();

                const tools = await document.modelContext.getTools(),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    patchTool = tools.find(tool => tool.name === "apply_recipe_patch"),
                    state = await window.__invokeWebMCPTool(stateTool, {}),
                    patchInput = {
                        expectedRevision: state.state.recipeRevision,
                        changes: [{
                            type: "insert",
                            operation: "Generate HOTP",
                            arguments: [accountName, 6, 7],
                        }],
                    },
                    pending = await window.__invokeWebMCPTool(patchTool, patchInput);
                window.__hotpBakeApproval = {
                    patchInput,
                    requestId: pending.error?.approvalRequestId,
                    accountName,
                };
                done({pending});
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message, stack: err.stack}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.pending.error.code, "USER_ACTION_REQUIRED");
        });
        browser.sendKeys("#webmcp-approve-bake", browser.Keys.ENTER);

        browser.executeAsync(async done => {
            const manager = window.app.manager,
                fixture = window.__hotpBakeApproval;
            try {
                const tools = await document.modelContext.getTools(),
                    patchTool = tools.find(tool => tool.name === "apply_recipe_patch"),
                    bakeTool = tools.find(tool => tool.name === "bake_recipe"),
                    inspectTool = tools.find(tool => tool.name === "inspect_output"),
                    approved = await window.__invokeWebMCPTool(patchTool, {
                        ...fixture.patchInput,
                        recipeApprovalRequestId: fixture.requestId,
                    }),
                    bakeInput = {
                        expectedRevision: approved.state.recipeRevision,
                        bakeApprovalRequestId: fixture.requestId,
                    },
                    bake = await window.__invokeWebMCPTool(bakeTool, bakeInput),
                    bakeIdAfter = manager.worker.bakeId,
                    inspection = await window.__invokeWebMCPTool(inspectTool, {
                        bakeId: bake.state.bakeId,
                    }),
                    replay = await window.__invokeWebMCPTool(bakeTool, bakeInput),
                    outputText = manager.output.outputEditorView.state.doc.toString(),
                    serializedResults = JSON.stringify({approved, bake, inspection, replay});
                done({
                    approved,
                    bake,
                    inspection,
                    replay,
                    approvalState: manager.approvals.getState(),
                    oneBake: manager.worker.bakeId === bakeIdAfter,
                    outputShape: outputText.startsWith(
                        "URI: otpauth://hotp/Empty%20input%20account?secret="
                    ) && /\n\nPassword: \d{6}$/u.test(outputText),
                    resultContainsAccount: serializedResults.includes(fixture.accountName),
                    resultContainsPassword: serializedResults.includes("Password:"),
                    resultContainsUri: serializedResults.includes("otpauth://"),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message, stack: err.stack}});
            } finally {
                delete window.__hotpBakeApproval;
                manager.controls.setAutoBake(false);
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.approved.ok, true);
            browser.assert.strictEqual(value.approved.data.approvedBakeAvailable, true);
            browser.assert.strictEqual(value.bake.ok, true);
            browser.assert.strictEqual(value.bake.state.terminalState, "completed");
            browser.assert.strictEqual(value.inspection.ok, true);
            browser.assert.strictEqual(value.replay.error.code, "INVALID_REQUEST");
            browser.assert.strictEqual(value.approvalState.state, "complete");
            browser.assert.strictEqual(value.oneBake, true);
            browser.assert.strictEqual(value.outputShape, true);
            browser.assert.strictEqual(value.resultContainsAccount, false);
            browser.assert.strictEqual(value.resultContainsPassword, false);
            browser.assert.strictEqual(value.resultContainsUri, false);
        });
        browser.sendKeys("#webmcp-stop", browser.Keys.ENTER);
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

    "Output inspection isolates bounded Magic options": browser => {
        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.executeAsync(async done => {
            const app = window.app,
                manager = app.manager;
            try {
                manager.controls.setAutoBake(false);
                app.setRecipeConfig([]);
                const inputView = manager.input.inputEditorView;
                inputView.dispatch({
                    changes: {
                        from: 0,
                        to: inputView.state.doc.length,
                        insert: "48656c6c6f",
                    },
                });

                const tools = await document.modelContext.getTools(),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    patchTool = tools.find(tool => tool.name === "apply_recipe_patch"),
                    bakeTool = tools.find(tool => tool.name === "bake_recipe"),
                    inspectTool = tools.find(tool => tool.name === "inspect_output"),
                    state = await window.__invokeWebMCPTool(stateTool, {}),
                    bake = await window.__invokeWebMCPTool(bakeTool, {
                        expectedRevision: state.state.recipeRevision,
                    }),
                    matching = await window.__invokeWebMCPTool(inspectTool, {
                        bakeId: bake.state.bakeId,
                        depth: 1,
                        intensiveMode: false,
                        extensiveLanguageSupport: false,
                        crib: "^Hello$",
                    }),
                    notMatching = await window.__invokeWebMCPTool(inspectTool, {
                        bakeId: bake.state.bakeId,
                        depth: 1,
                        intensiveMode: false,
                        extensiveLanguageSupport: false,
                        crib: "^World$",
                    }),
                    candidate = matching.data?.candidates?.[0],
                    candidatePatch = candidate ? await window.__invokeWebMCPTool(
                        patchTool,
                        {
                            expectedRevision: matching.data.recipeRevision,
                            analysisCandidateId: candidate.candidateId,
                        }
                    ) : null,
                    config = manager.recipe.getConfig();

                done({
                    bake,
                    matching,
                    notMatching,
                    candidatePatch,
                    config,
                    candidateParametersHidden: !JSON.stringify(matching).includes("\"None\""),
                    containsCrib: /Hello|World/u.test(
                        JSON.stringify({matching, notMatching, candidatePatch})
                    ),
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            } finally {
                manager.controls.setAutoBake(false);
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.bake.ok, true);
            browser.assert.strictEqual(value.matching.ok, true);
            browser.assert.strictEqual(
                value.matching.data.candidateOperationNames.includes("From Hex"),
                true
            );
            browser.assert.strictEqual(value.matching.data.candidates.length > 0, true);
            browser.assert.deepStrictEqual(
                value.matching.data.candidates[0].operationNames,
                ["From Hex"]
            );
            browser.assert.strictEqual(value.candidatePatch.ok, true);
            browser.assert.strictEqual(value.config.length, 1);
            browser.assert.strictEqual(value.config[0].op, "From Hex");
            browser.assert.deepStrictEqual(value.config[0].args, ["None"]);
            browser.assert.strictEqual(value.candidateParametersHidden, true);
            browser.assert.strictEqual(
                value.notMatching.error.code,
                "ANALYSIS_EMPTY"
            );
            browser.assert.strictEqual(value.containsCrib, false);
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
