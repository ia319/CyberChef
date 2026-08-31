import HTMLOperation from "../HTMLOperation.mjs";
import {
    applyArgSelectorVisibility,
    RECIPE_INGREDIENT_HANDLER_GROUP,
} from "../HTMLIngredient.mjs";


/**
 * Applies one compatible Operation configuration to a rendered Recipe element.
 *
 * @param {HTMLElement} element - Detached Recipe Operation element.
 * @param {Object} config - Compatible Operation configuration.
 */
function applyOperationConfig(element, config) {
    const args = element.querySelectorAll(".arg");
    if (!Array.isArray(config.args) || args.length !== config.args.length) {
        throw new TypeError("Recipe Operation arguments do not match the rendered controls");
    }

    for (let index = 0; index < args.length; index++) {
        const control = args[index],
            value = config.args[index];
        if (control.getAttribute("type") === "checkbox") {
            if (typeof value !== "boolean") {
                throw new TypeError("Recipe checkbox argument is invalid");
            }
            control.checked = value;
        } else if (control.classList.contains("toggle-string")) {
            if (!value || typeof value !== "object" || Array.isArray(value) ||
                typeof value.option !== "string" || typeof value.string !== "string") {
                throw new TypeError("Recipe toggle argument is invalid");
            }
            control.value = value.string;
            control.parentNode.parentNode.querySelector("button").textContent = value.option;
        } else {
            control.value = value;
        }
    }

    if (config.disabled === true) {
        const disable = element.querySelector(".disable-icon");
        disable.setAttribute("disabled", "true");
        disable.classList.add("disable-icon-selected");
        element.classList.add("disabled");
    }
    if (config.breakpoint === true) {
        const breakpoint = element.querySelector(".breakpoint");
        breakpoint.setAttribute("break", "true");
        breakpoint.classList.add("breakpoint-selected");
    }
}


/**
 * Captures non-semantic Recipe view state by stable step identity.
 *
 * @param {HTMLElement} recipeList - Live Recipe list.
 * @returns {Map<string, Object>} View state keyed by step identity.
 */
function captureViewState(recipeList) {
    const state = new Map();
    for (const element of recipeList.querySelectorAll(":scope > li.operation")) {
        const hideArgs = element.querySelector(".hide-args-icon");
        state.set(element.dataset.recipeStepId, {
            argsHidden: hideArgs?.getAttribute("hide-args") === "true",
        });
    }
    return state;
}


/**
 * Restores one collapsed-arguments view state.
 *
 * @param {HTMLElement} element - Detached Recipe Operation element.
 * @param {Object|undefined} viewState - Captured view state.
 */
function restoreViewState(element, viewState) {
    if (!viewState?.argsHidden) return;

    const hideArgs = element.querySelector(".hide-args-icon");
    hideArgs.setAttribute("hide-args", "true");
    hideArgs.textContent = "keyboard_arrow_down";
    hideArgs.classList.add("hide-args-selected");
    element.querySelector(".ingredients").style.display = "none";
}


/**
 * Captures focus inside one Recipe argument for restoration after publication.
 *
 * @param {HTMLElement} recipeList - Live Recipe list.
 * @returns {Object|null} Stable focus descriptor.
 */
function captureFocus(recipeList) {
    const activeElement = document.activeElement;
    if (!activeElement || !recipeList.contains(activeElement)) return null;

    const operation = activeElement.closest("li.operation");
    if (!operation?.dataset.recipeStepId) return null;
    return {
        stepId: operation.dataset.recipeStepId,
        argumentIndex: Array.from(operation.querySelectorAll(".arg")).indexOf(activeElement),
    };
}


/**
 * Restores focus to the same Recipe argument when it remains present.
 *
 * @param {HTMLElement} recipeList - Published Recipe list.
 * @param {Object|null} focus - Stable focus descriptor.
 */
function restoreFocus(recipeList, focus) {
    if (!focus || focus.argumentIndex < 0) return;
    const operation = Array.from(recipeList.querySelectorAll(":scope > li.operation"))
        .find(element => element.dataset.recipeStepId === focus.stepId);
    operation?.querySelectorAll(".arg")[focus.argumentIndex]?.focus();
}


/**
 * Builds reversible detached Recipe DOM projections.
 */
class RecipeDOMProjection {
    #app;
    #manager;

    /**
     * Creates a Recipe DOM projection adapter.
     *
     * @param {App} app - CyberChef application.
     * @param {Manager} manager - CyberChef waiter manager.
     */
    constructor(app, manager) {
        this.#app = app;
        this.#manager = manager;
    }


    /**
     * Builds a detached Recipe projection and its reversible publication.
     *
     * @param {Object[]} steps - Prepared Recipe model steps.
     * @returns {Object} Synchronous publish and rollback operations.
     */
    prepare(steps) {
        if (!Array.isArray(steps)) throw new TypeError("Recipe projection steps must be an array");

        const recipeList = document.getElementById("rec-list"),
            viewState = captureViewState(recipeList),
            focus = captureFocus(recipeList),
            listeners = [],
            projectionManager = Object.create(this.#manager),
            projectionApp = Object.create(this.#app),
            fragment = document.createDocumentFragment();
        let nextIngredientId = this.#app.ingId;

        projectionManager.addDynamicListener = (selector, eventType, callback, scope) => {
            listeners.push({selector, eventType, callback, scope});
        };
        projectionApp.nextIngId = () => nextIngredientId++;

        for (const step of steps) {
            const operationConfig = this.#app.operations[step.operation.op];
            if (!operationConfig) throw new TypeError("Recipe projection contains an unknown Operation");

            const element = document.createElement("li"),
                operation = new HTMLOperation(
                    step.operation.op,
                    operationConfig,
                    projectionApp,
                    projectionManager
                );
            element.classList.add("operation");
            element.dataset.recipeStepId = step.stepId;
            element.innerHTML = operation.toFullHtml();
            if (operationConfig.flowControl) element.classList.add("flow-control-op");
            applyOperationConfig(element, step.operation);
            for (const selector of element.querySelectorAll(".arg-selector")) {
                applyArgSelectorVisibility(selector);
            }
            restoreViewState(element, viewState.get(step.stepId));
            fragment.appendChild(element);
        }

        const recipeHandlerEventTypes = Object.entries(this.#manager.dynamicHandlers)
                .filter(([, handlers]) => handlers.some(handler =>
                    handler.scope?.dynamicHandlerGroup === RECIPE_INGREDIENT_HANDLER_GROUP
                ))
                .map(([eventType]) => eventType),
            handlerEventTypes = new Set([
                ...recipeHandlerEventTypes,
                ...listeners.map(listener => listener.eventType),
            ]),
            handlerSnapshots = new Map();
        for (const eventType of handlerEventTypes) {
            const handlers = this.#manager.dynamicHandlers[eventType];
            if (!Array.isArray(handlers)) {
                throw new TypeError("Recipe projection requires an initialized event type");
            }
            handlerSnapshots.set(eventType, [...handlers]);
        }

        const oldChildren = Array.from(recipeList.childNodes),
            oldIngredientId = this.#app.ingId,
            oldActiveElement = document.activeElement;
        let publicationStarted = false;

        return {
            publish: () => {
                if (publicationStarted) throw new TypeError("Recipe projection was already published");
                publicationStarted = true;
                recipeList.replaceChildren(fragment);
                this.#app.ingId = nextIngredientId;
                for (const eventType of handlerSnapshots.keys()) {
                    const handlers = this.#manager.dynamicHandlers[eventType],
                        retained = handlers.filter(handler =>
                            handler.scope?.dynamicHandlerGroup !== RECIPE_INGREDIENT_HANDLER_GROUP
                        );
                    handlers.splice(0, handlers.length, ...retained);
                }
                for (const listener of listeners) {
                    this.#manager.addDynamicListener(
                        listener.selector,
                        listener.eventType,
                        listener.callback,
                        listener.scope
                    );
                }
                $(recipeList).find("[data-toggle='tooltip']").tooltip();
                restoreFocus(recipeList, focus);
            },
            rollback: () => {
                if (!publicationStarted) return;
                $(recipeList).find("[data-toggle='tooltip']").tooltip("dispose");
                recipeList.replaceChildren(...oldChildren);
                this.#app.ingId = oldIngredientId;
                for (const [eventType, handlers] of handlerSnapshots) {
                    this.#manager.dynamicHandlers[eventType].splice(
                        0,
                        this.#manager.dynamicHandlers[eventType].length,
                        ...handlers
                    );
                }
                if (oldActiveElement?.isConnected) oldActiveElement.focus();
                publicationStarted = false;
            },
        };
    }
}

export default RecipeDOMProjection;
