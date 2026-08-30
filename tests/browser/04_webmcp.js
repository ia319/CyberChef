/**
 * Tests the visible WebMCP Recipe access controls.
 *
 * @license Apache-2.0
 */

const RECIPE_PROFILE = Object.freeze({
    name: "recipe",
    toolNames: Object.freeze([
        "search_operations",
        "get_operation_details",
        "get_recipe_state",
        "apply_recipe_patch",
    ]),
    stateFields: Object.freeze([
        "sessionEpoch",
        "recipeRevision",
        "executionCapability",
    ]),
    authorizationText: "Allows WebMCP tools to search Operations, read redacted Recipe structure, and apply visible Recipe changes. WebMCP changes do not run automatically; the user runs Bake to check results.",
});

let initialSessionState;


module.exports = {
    before: browser => {
        browser
            .resizeWindow(1280, 1000)
            .url(browser.launchUrl)
            .useCss()
            .waitForElementNotPresent("#preloader", 10000);
    },

    "Recipe access exposes explicit and accessible controls": browser => {
        browser.execute(profile => {
            const collaboration = window.app.manager.collaboration,
                initiallyHidden = document.getElementById("webmcp-collaboration").hidden;

            collaboration.buildProfile = profile;
            collaboration.setup();

            return {
                providerAvailable: Boolean(document.modelContext),
                initiallyHidden,
                url: window.location.href,
                storageKeys: Object.keys(window.localStorage),
            };
        }, [RECIPE_PROFILE], ({value}) => {
            browser.assert.strictEqual(value.providerAvailable, true);
            browser.assert.strictEqual(value.initiallyHidden, true);
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

    "Recipe access shows, retains, and restores an Agent change": browser => {
        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
        browser.execute(() => {
            const recipe = window.app.manager.recipe;

            window.app.setRecipeConfig([]);
            const before = recipe.getReadProjection(),
                result = recipe.applyAgentPatch({
                    expectedRevision: before.recipeRevision,
                    changes: [{type: "insert", operation: "To Base64"}],
                });

            return {
                result,
                config: recipe.getConfig(),
                panelText: document.getElementById("webmcp-collaboration").textContent,
            };
        }, [], ({value}) => {
            browser.assert.strictEqual(value.result.status, "committed");
            browser.assert.strictEqual(value.config.length, 1);
            browser.assert.strictEqual(value.panelText.includes("A-Za-z0-9+/="), false);
        });

        browser.expect.element("#webmcp-change-summary").text.to.equal(
            "Latest WebMCP change: Added To Base64."
        );
        browser.expect.element(".webmcp-step-badge").to.be.visible;
        browser.expect.element(".webmcp-step-badge").text.to.equal("WebMCP change");
        browser.expect.element("#webmcp-revert").to.be.enabled;

        browser.sendKeys("#webmcp-stop", browser.Keys.ENTER);
        browser.execute(() => window.app.manager.recipe.getConfig(), [], ({value}) => {
            browser.assert.strictEqual(value.length, 1);
            browser.assert.strictEqual(value[0].op, "To Base64");
        });

        browser.sendKeys("#webmcp-start", browser.Keys.ENTER);
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

        browser.execute(() => {
            const recipe = window.app.manager.recipe,
                before = recipe.getReadProjection();
            recipe.applyAgentPatch({
                expectedRevision: before.recipeRevision,
                changes: [{type: "insert", operation: "From Hex"}],
            });
            document.querySelector("#rec-list .disable-icon").click();
        });
        browser.expect.element("#webmcp-revert").to.not.be.enabled;
        browser.expect.element(".webmcp-step-badge").to.not.be.present;
        browser.expect.element("#webmcp-revert-state").text.to.contain(
            "Recipe changed after the WebMCP change"
        );
    },

    after: browser => {
        browser.end();
    },
};
