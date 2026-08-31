import {COLLABORATION_SESSION_STATE} from "../webmcp/CollaborationSession.mjs";
import {TOOL_CONTRACTS} from "../webmcp/ToolDefinitions.mjs";
import {
    RECIPE_REVERT_REASON,
    RECIPE_TRANSACTION_ACTOR,
    RECIPE_TRANSACTION_SOURCE,
} from "../recipe/RecipeTransaction.mjs";

const ACTION_TEXT = Object.freeze({
    insert: "Added",
    remove: "Removed",
    move: "Moved",
    enable: "Enabled",
    disable: "Disabled",
    setBreakpoint: "Changed the breakpoint for",
    setArgument: "Changed an argument for",
});

const SUMMARY_ACTION_LIMIT = 3;


/**
 * Formats a bounded Recipe action summary without argument values.
 *
 * @param {Object[]} actions - Trusted Agent Recipe actions.
 * @returns {string} Human-readable action summary.
 */
function formatAgentChangeSummary(actions) {
    if (!Array.isArray(actions) || actions.length === 0) {
        return "Latest WebMCP change updated the Recipe.";
    }

    const visibleActions = actions.slice(0, SUMMARY_ACTION_LIMIT).map(action => {
            const actionText = ACTION_TEXT[action.type] || "Changed";
            return `${actionText} ${action.operationName}`;
        }),
        hiddenActionCount = actions.length - visibleActions.length,
        remainder = hiddenActionCount > 0 ? `; ${hiddenActionCount} more changes` : "";

    return `Latest WebMCP change: ${visibleActions.join("; ")}${remainder}.`;
}


/**
 * Adapts collaboration Session and Recipe change state to visible page controls.
 */
class CollaborationWaiter {

    /**
     * Creates the WebMCP Recipe access UI adapter.
     *
     * @param {Manager} manager - CyberChef waiter manager.
     * @param {CollaborationSession} session - Page-scoped authorization owner.
     * @param {Object} buildProfile - Immutable registered tool profile.
     */
    constructor(manager, session, buildProfile) {
        this.manager = manager;
        this.session = session;
        this.buildProfile = buildProfile;
        this.listenersRegistered = false;
        this.lastSessionState = null;
        this.latestAgentChange = null;
        this.agentStepIds = new Set();

        this.startClick = this.startClick.bind(this);
        this.stopClick = this.stopClick.bind(this);
        this.revertClick = this.revertClick.bind(this);
        this.sessionChange = this.sessionChange.bind(this);
        this.recipeChange = this.recipeChange.bind(this);
    }


    /**
     * Connects the UI only when this build exposes protected WebMCP tools.
     */
    setup() {
        const panel = document.getElementById("webmcp-collaboration"),
            state = this.session.getState(),
            hasProtectedTools = this.buildProfile.toolNames.some(name =>
                TOOL_CONTRACTS[name]?.requiresSession === true
            );

        panel.hidden = state.state === COLLABORATION_SESSION_STATE.UNAVAILABLE || !hasProtectedTools;
        if (panel.hidden || this.listenersRegistered) return;

        this.panel = panel;
        this.startButton = document.getElementById("webmcp-start");
        this.stopButton = document.getElementById("webmcp-stop");
        this.revertButton = document.getElementById("webmcp-revert");
        this.sessionState = document.getElementById("webmcp-session-state");
        this.liveStatus = document.getElementById("webmcp-live-status");
        this.profileSummary = document.getElementById("webmcp-profile-summary");
        this.toolList = document.getElementById("webmcp-tool-list");
        this.changeSummary = document.getElementById("webmcp-change-summary");
        this.revertState = document.getElementById("webmcp-revert-state");

        this.profileSummary.textContent = this.buildProfile.authorizationText;
        this.toolList.textContent = `Available tools: ${this.buildProfile.toolNames.join(", ")}.`;

        this.startButton.addEventListener("click", this.startClick);
        this.stopButton.addEventListener("click", this.stopClick);
        this.revertButton.addEventListener("click", this.revertClick);
        this.session.addEventListener("change", this.sessionChange);
        window.addEventListener("recipechange", this.recipeChange);
        this.listenersRegistered = true;
        this.lastSessionState = state.state;

        this.renderSessionState(false);
        this.renderRecipeState();
        this.manager.controls.calcControlsHeight();
    }


    /**
     * Starts Recipe access from an explicit user action.
     */
    startClick() {
        const state = this.session.start();
        if (state.state === COLLABORATION_SESSION_STATE.ACTIVE) this.stopButton.focus();
    }


    /**
     * Stops Recipe access while retaining committed Recipe changes.
     */
    stopClick() {
        const state = this.session.stop();
        if (state.state === COLLABORATION_SESSION_STATE.OFF) this.startButton.focus();
    }


    /**
     * Renders a Session transition with a persistent text status.
     */
    sessionChange() {
        this.renderSessionState(true);
    }


    /**
     * Updates the Session buttons and status announcement.
     *
     * @param {boolean} announce - Whether to announce a user-visible transition.
     */
    renderSessionState(announce) {
        const state = this.session.getState(),
            active = state.state === COLLABORATION_SESSION_STATE.ACTIVE,
            wasActive = this.lastSessionState === COLLABORATION_SESSION_STATE.ACTIVE;

        this.startButton.hidden = active;
        this.stopButton.hidden = !active;
        this.sessionState.textContent = active ? "Active" : "Off";

        if (announce) {
            this.liveStatus.textContent = active ?
                "WebMCP Recipe access started." :
                wasActive ?
                    "WebMCP Recipe access stopped. Existing Recipe changes remain." :
                    "WebMCP Recipe access is off.";
        } else {
            this.liveStatus.textContent = active ?
                "WebMCP Recipe access is active." : "WebMCP Recipe access is off.";
        }

        this.lastSessionState = state.state;
    }


    /**
     * Renders one committed Recipe change without displaying argument values.
     *
     * @param {CustomEvent} event - Structured Recipe change event.
     */
    recipeChange(event) {
        const change = event.detail;
        if (!change || typeof change !== "object") return;

        if (change.actor === RECIPE_TRANSACTION_ACTOR.AGENT &&
            change.source === RECIPE_TRANSACTION_SOURCE.WEBMCP) {
            this.latestAgentChange = change;
            const actions = Array.isArray(change.actions) ? change.actions : [];
            this.agentStepIds = new Set(actions.map(action => action.stepId));
        } else if (change.source === RECIPE_TRANSACTION_SOURCE.REVERT) {
            this.latestAgentChange = null;
            this.agentStepIds.clear();
        } else if (this.latestAgentChange) {
            this.agentStepIds.clear();
        }

        this.renderRecipeState();
        this.manager.controls.calcControlsHeight();
    }


    /**
     * Restores the latest eligible WebMCP Recipe change.
     */
    revertClick() {
        try {
            this.manager.recipe.revertAgentPatch();
            this.liveStatus.textContent = "Latest WebMCP Recipe change restored.";
        } catch {
            this.renderRecipeState();
            this.liveStatus.textContent = "The WebMCP Recipe change could not be restored.";
        }

        const state = this.session.getState();
        if (state.state === COLLABORATION_SESSION_STATE.ACTIVE) this.stopButton.focus();
        else this.startButton.focus();
    }


    /**
     * Updates the latest change summary, step badges, and Revert availability.
     */
    renderRecipeState() {
        const revertState = this.manager.recipe.getAgentRevertState(),
            operations = Array.from(document.querySelectorAll("#rec-list li.operation")),
            visibleStepIds = new Set(operations.map(operation => operation.dataset.recipeStepId));

        this.agentStepIds = new Set(
            [...this.agentStepIds].filter(stepId => visibleStepIds.has(stepId))
        );
        this.changeSummary.textContent = this.latestAgentChange ?
            formatAgentChangeSummary(this.latestAgentChange.actions) :
            "No WebMCP Recipe change has been applied on this page.";

        document.querySelectorAll(".webmcp-step-badge").forEach(badge => badge.remove());
        for (const operation of operations) {
            if (!this.agentStepIds.has(operation.dataset.recipeStepId)) continue;

            const badge = document.createElement("span");
            badge.className = "webmcp-step-badge";
            badge.textContent = "WebMCP change";
            operation.querySelector(".op-title")?.after(badge);
        }

        this.revertButton.disabled = !revertState.available;
        if (revertState.available) {
            this.revertState.textContent = "The latest WebMCP Recipe change can be restored.";
        } else if (revertState.reason === RECIPE_REVERT_REASON.RECIPE_CHANGED) {
            this.revertState.textContent = "Revert is unavailable because the Recipe changed after the WebMCP change.";
        } else if (revertState.reason === RECIPE_REVERT_REASON.ALREADY_USED) {
            this.revertState.textContent = "The latest WebMCP Recipe change was restored.";
        } else {
            this.revertState.textContent = "No WebMCP Recipe change is available to restore.";
        }
    }
}

export {
    formatAgentChangeSummary,
};
export default CollaborationWaiter;
