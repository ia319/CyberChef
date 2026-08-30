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
            window.dispatchEvent(window.app.manager.statechange);
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
        });

        browser
            .pause(50)
            .url(function({value}) {
                browser.assert.strictEqual(value.includes("recipe-step-"), false);
            });
    },

    after: browser => {
        browser.end();
    }
};
