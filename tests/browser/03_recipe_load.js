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

    "Agent Recipe transaction publishes once without Auto Bake": browser => {
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
            window.addEventListener("recipechange", event => {
                window.__recipeChangeEvents.push(event.detail);
            }, {once: true});

            const bakeId = app.manager.worker.bakeId,
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

    after: browser => {
        browser.end();
    }
};
