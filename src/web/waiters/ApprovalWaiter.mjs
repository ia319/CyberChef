import {
    APPROVAL_MODE,
    APPROVAL_STATE,
} from "../webmcp/ApprovalCoordinator.mjs";
import {COLLABORATION_SESSION_STATE} from "../webmcp/CollaborationSession.mjs";

const CHANGE_TEXT = Object.freeze({
        insert: "add an Operation",
        update: "change an Operation",
        remove: "remove an Operation",
        move: "move an Operation",
        setDisabled: "change whether an Operation is enabled",
        setBreakpoint: "change an Operation breakpoint",
    }),
    RISK_TEXT = Object.freeze({
        secretInput: "process sensitive Input data",
        sensitiveOutput: "produce sensitive output",
        networkAccess: "make a network request",
        richContent: "produce active or rich content",
        resourceIntensive: "use significant browser resources",
        browserSideEffect: "perform a browser-visible side effect",
    }),
    TERMINAL_STATUS = Object.freeze({
        [APPROVAL_STATE.COMPLETE]: "The approved WebMCP action completed.",
        [APPROVAL_STATE.REJECTED]: "The WebMCP action was rejected.",
        [APPROVAL_STATE.EXPIRED]: "The WebMCP approval request expired.",
        [APPROVAL_STATE.CANCELLED]: "The WebMCP approval was cancelled.",
    });


/**
 * Formats a bounded list as readable text.
 *
 * @param {Array<string>} values - Trusted redacted labels.
 * @returns {string} Comma-separated text.
 */
function formatList(values) {
    if (values.length === 1) return values[0];
    return `${values.slice(0, -1).join(", ")} and ${values.at(-1)}`;
}


/**
 * Formats the visible approval details without parameter values.
 *
 * @param {Object} summary - Coordinator-validated approval summary.
 * @returns {Object} Operation, change, parameter, and risk text.
 */
function formatApprovalSummary(summary) {
    const changes = summary.changeTypes.map(type => CHANGE_TEXT[type]),
        risks = summary.riskFlags.map(flag => RISK_TEXT[flag]);
    return Object.freeze({
        operations: `Operations: ${formatList(summary.operationNames)}.`,
        changes: `Requested Recipe effects: ${formatList(changes)}.`,
        parameters: summary.sensitiveParameterNames.length > 0 ?
            `Values remain hidden. Sensitive parameters: ${formatList(summary.sensitiveParameterNames)}.` :
            "No sensitive parameters are identified for this request.",
        risks: risks.length > 0 ?
            `Additional effects: ${formatList(risks)}.` :
            "No additional sensitive effects are identified for this request.",
    });
}


/**
 * Adapts one-use approval state to the visible collaboration controls.
 */
class ApprovalWaiter {

    /**
     * Creates the WebMCP approval UI adapter.
     *
     * @param {Manager} manager - CyberChef waiter manager.
     * @param {CollaborationSession} session - Active collaboration owner.
     * @param {ApprovalCoordinator} approvals - One-use approval owner.
     */
    constructor(manager, session, approvals) {
        this.manager = manager;
        this.session = session;
        this.approvals = approvals;
        this.listenersRegistered = false;
        this.lastState = APPROVAL_STATE.NONE;

        this.approvalChange = this.approvalChange.bind(this);
        this.recipeOnlyClick = this.recipeOnlyClick.bind(this);
        this.recipeAndBakeClick = this.recipeAndBakeClick.bind(this);
        this.rejectClick = this.rejectClick.bind(this);
    }


    /**
     * Connects the approval UI to its in-memory state owner.
     */
    setup() {
        if (this.listenersRegistered) return;

        this.panel = document.getElementById("webmcp-approval");
        this.operations = document.getElementById("webmcp-approval-operations");
        this.changes = document.getElementById("webmcp-approval-changes");
        this.parameters = document.getElementById("webmcp-approval-parameters");
        this.risks = document.getElementById("webmcp-approval-risks");
        this.effect = document.getElementById("webmcp-approval-effect");
        this.recipeOnlyButton = document.getElementById("webmcp-approve-recipe");
        this.recipeAndBakeButton = document.getElementById("webmcp-approve-bake");
        this.rejectButton = document.getElementById("webmcp-reject-approval");
        this.liveStatus = document.getElementById("webmcp-live-status");

        this.recipeOnlyButton.addEventListener("click", this.recipeOnlyClick);
        this.recipeAndBakeButton.addEventListener("click", this.recipeAndBakeClick);
        this.rejectButton.addEventListener("click", this.rejectClick);
        this.approvals.addEventListener("change", this.approvalChange);
        this.listenersRegistered = true;
        this.render();
    }


    /**
     * Grants a Recipe-only permit from an explicit page action.
     */
    recipeOnlyClick() {
        this.approve(APPROVAL_MODE.RECIPE_ONLY);
    }


    /**
     * Grants a Recipe mutation and one exact Bake permit from an explicit page action.
     */
    recipeAndBakeClick() {
        this.approve(APPROVAL_MODE.RECIPE_AND_BAKE);
    }


    /**
     * Applies one user-selected approval mode to the pending request.
     *
     * @param {string} mode - Recipe-only or Recipe-and-Bake mode.
     */
    approve(mode) {
        const request = this.approvals.getState(),
            session = this.session.getState();
        try {
            this.approvals.approve(request.requestId, session.sessionEpoch, mode);
        } catch {
            this.render();
            this.liveStatus.textContent = "The WebMCP approval is no longer available.";
        }
        this.focusSessionControl();
    }


    /**
     * Rejects a pending request or cancels a granted permit.
     */
    rejectClick() {
        const request = this.approvals.getState(),
            session = this.session.getState();
        try {
            if (request.state === APPROVAL_STATE.PENDING) {
                this.approvals.reject(request.requestId, session.sessionEpoch);
            } else {
                this.approvals.cancel(request.requestId, session.sessionEpoch);
            }
        } catch {
            this.render();
            this.liveStatus.textContent = "The WebMCP approval is no longer available.";
        }
        this.focusSessionControl();
    }


    /**
     * Renders an approval transition and updates the controls height.
     */
    approvalChange() {
        this.render();
        this.manager.controls.calcControlsHeight();
    }


    /**
     * Updates visible details, choices, focus, and status announcements.
     */
    render() {
        const request = this.approvals.getState(),
            wasPending = this.lastState === APPROVAL_STATE.PENDING;

        if (request.state === APPROVAL_STATE.NONE || TERMINAL_STATUS[request.state]) {
            const restoreFocus = !this.panel.hidden && this.panel.contains(document.activeElement);
            this.panel.hidden = true;
            if (TERMINAL_STATUS[request.state] && this.lastState !== request.state) {
                this.liveStatus.textContent = TERMINAL_STATUS[request.state];
            }
            if (restoreFocus) this.focusSessionControl();
            this.lastState = request.state;
            return;
        }

        const summary = formatApprovalSummary(request.summary),
            pending = request.state === APPROVAL_STATE.PENDING;
        this.panel.hidden = false;
        this.operations.textContent = summary.operations;
        this.changes.textContent = summary.changes;
        this.parameters.textContent = summary.parameters;
        this.risks.textContent = summary.risks;
        this.recipeOnlyButton.hidden = !pending;
        this.recipeAndBakeButton.hidden = !pending;
        this.rejectButton.textContent = pending ? "Reject" : "Cancel approval";
        this.effect.textContent = pending ?
            "Choose whether to change only the Recipe or also run the exact updated Recipe once. " +
                "Recipe-only approval leaves the current Output stale." :
            request.mode === APPROVAL_MODE.RECIPE_ONLY ?
                "Approved effect: change the Recipe without running it." :
                "Approved effect: change the Recipe and run the exact updated Recipe once.";

        if (pending && !wasPending) {
            this.liveStatus.textContent = "A WebMCP action needs approval.";
            this.panel.focus();
        } else if (!pending && wasPending) {
            this.liveStatus.textContent = request.mode === APPROVAL_MODE.RECIPE_ONLY ?
                "WebMCP Recipe change approved without a Bake." :
                "WebMCP Recipe change and one exact Bake approved.";
        }
        this.lastState = request.state;
    }


    /**
     * Moves focus to the available page-scoped collaboration control.
     */
    focusSessionControl() {
        const session = this.session.getState(),
            controlId = session.state === COLLABORATION_SESSION_STATE.ACTIVE ?
                "webmcp-stop" : "webmcp-start";
        document.getElementById(controlId).focus();
    }
}

export {
    formatApprovalSummary,
};
export default ApprovalWaiter;
