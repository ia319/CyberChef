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
            browser.assert.strictEqual(value.profileName, "recipe");
            browser.assert.deepStrictEqual(value.toolNames, [
                "search_operations",
                "get_operation_details",
                "get_recipe_state",
                "apply_recipe_patch",
            ]);
            initialSessionState = value;
        });

        browser.expect.element("#webmcp-collaboration").to.be.visible;
        browser.expect.element("#webmcp-heading").text.to.equal("WebMCP Recipe access");
        browser.expect.element("#webmcp-tool-list").text.to.contain("apply_recipe_patch");
        browser.expect.element("#webmcp-profile-summary").text.to.contain("user runs Bake");
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
                "get_operation_details",
                "get_recipe_state",
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
            try {
                window.app.setRecipeConfig([]);
                const tools = await document.modelContext.getTools(),
                    stateTool = tools.find(tool => tool.name === "get_recipe_state"),
                    patchTool = tools.find(tool => tool.name === "apply_recipe_patch"),
                    state = await window.__invokeWebMCPTool(stateTool, {}),
                    bakeIdBefore = window.app.manager.worker.bakeId,
                    patch = await window.__invokeWebMCPTool(patchTool, {
                        expectedRevision: state.state.recipeRevision,
                        changes: [{type: "insert", operation: "To Base64"}],
                    });

                window.__webmcpBakeIdBefore = bakeIdBefore;
                done({
                    state,
                    patch,
                    bakeIdBefore,
                    bakeIdAfterPatch: window.app.manager.worker.bakeId,
                    config: window.app.manager.recipe.getConfig(),
                    panelText: document.getElementById("webmcp-collaboration").textContent,
                });
            } catch (err) {
                done({scriptError: {name: err.name, message: err.message}});
            }
        }, [], ({value}) => {
            browser.assert.strictEqual(value.scriptError, undefined);
            browser.assert.strictEqual(value.state.ok, true);
            browser.assert.strictEqual(value.state.state.executionCapability, "USER_BAKE_REQUIRED");
            browser.assert.strictEqual(value.patch.ok, true);
            browser.assert.strictEqual(value.patch.data.status, "committed");
            browser.assert.strictEqual(value.patch.data.insertedSteps.stepIds.length, 1);
            browser.assert.strictEqual(value.bakeIdAfterPatch, value.bakeIdBefore);
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

        browser.click("#bake").pause(100).execute(() => ({
            bakeIdBefore: window.__webmcpBakeIdBefore,
            bakeIdAfter: window.app.manager.worker.bakeId,
        }), [], ({value}) => {
            browser.assert.strictEqual(value.bakeIdAfter > value.bakeIdBefore, true);
        });

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

    after: browser => {
        browser.end();
    },
};
