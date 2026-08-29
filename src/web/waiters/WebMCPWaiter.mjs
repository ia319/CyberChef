import { executeTool } from "../webmcp/ToolExecutor.mjs";
import {
    READINESS_TOOL_CONTRACT,
    READINESS_TOOL_NAME,
} from "../webmcp/ToolDefinitions.mjs";

const PROBE_DELAY_MS = 100;


/**
 * Adapts CyberChef's page lifecycle to the browser's WebMCP provider API.
 */
class WebMCPWaiter {

    /**
     * Creates the WebMCP provider boundary.
     *
     * @param {ModelContext|null|undefined} modelContext - Browser WebMCP API, when supported.
     * @param {EventTarget} documentTarget - Document event target that emits `apploaded`.
     * @param {EventTarget} lifecycleTarget - Window event target for page lifecycle events.
     */
    constructor(modelContext, documentTarget, lifecycleTarget) {
        this.modelContext = modelContext;
        this.documentTarget = documentTarget;
        this.lifecycleTarget = lifecycleTarget;

        this.listenersRegistered = false;
        this.registrationController = null;
        this.registrationPromise = null;
        this.registrationState = "idle";
        this.registrationErrorName = null;

        this.handleAppLoaded = this.registerProbeTool.bind(this);
        this.handlePageHide = this.unregisterProbeTool.bind(this);
        this.handlePageShow = this.restoreAfterBFCache.bind(this);
        this.executeProbe = this.executeProbe.bind(this);

        this.probeTool = Object.freeze({
            name: READINESS_TOOL_NAME,
            title: READINESS_TOOL_CONTRACT.title,
            description: READINESS_TOOL_CONTRACT.description,
            inputSchema: READINESS_TOOL_CONTRACT.inputSchema,
            annotations: READINESS_TOOL_CONTRACT.annotations,
            execute: (input, options) => executeTool(
                READINESS_TOOL_CONTRACT,
                this.executeProbe,
                input,
                options
            ),
        });
    }


    /**
     * Connects provider registration to application and page lifecycle events.
     */
    setup() {
        if (this.listenersRegistered) return;

        this.documentTarget.addEventListener("apploaded", this.handleAppLoaded);
        this.lifecycleTarget.addEventListener("pagehide", this.handlePageHide);
        this.lifecycleTarget.addEventListener("pageshow", this.handlePageShow);
        this.listenersRegistered = true;
    }


    /**
     * Registers the fixed readiness probe once for the current page lifecycle.
     *
     * @returns {Promise<string>} The resulting provider registration state.
     */
    registerProbeTool() {
        if (!this.modelContext || typeof this.modelContext.registerTool !== "function") {
            this.registrationState = "unsupported";
            return Promise.resolve(this.registrationState);
        }

        if (this.registrationController && !this.registrationController.signal.aborted) {
            return this.registrationPromise || Promise.resolve(this.registrationState);
        }

        this.registrationController = new AbortController();
        this.registrationState = "registering";
        this.registrationErrorName = null;
        this.registrationPromise = this.completeRegistration(this.registrationController);

        return this.registrationPromise;
    }


    /**
     * Completes one registration attempt without letting a stale attempt overwrite a newer one.
     *
     * @param {AbortController} controller - Controller that owns this registration attempt.
     * @returns {Promise<string>} The resulting provider registration state.
     */
    async completeRegistration(controller) {
        try {
            await this.modelContext.registerTool(this.probeTool, {
                signal: controller.signal,
            });

            if (this.registrationController === controller) {
                this.registrationState = "registered";
            }
        } catch (err) {
            if (this.registrationController === controller) {
                this.registrationState = controller.signal.aborted ? "idle" : "failed";
                this.registrationErrorName = controller.signal.aborted ? null : err.name;
            }
        } finally {
            if (this.registrationController === controller) {
                if (this.registrationState !== "registered") {
                    this.registrationController = null;
                }
                this.registrationPromise = null;
            }
        }

        return this.registrationState;
    }


    /**
     * Aborts the registration so the browser unregisters the probe tool.
     */
    unregisterProbeTool() {
        if (this.registrationController) {
            this.registrationController.abort();
        }

        this.registrationController = null;
        this.registrationPromise = null;
        this.registrationState = "idle";
        this.registrationErrorName = null;
    }


    /**
     * Restores the static provider after a BFCache page restoration.
     *
     * @param {PageTransitionEvent|Event} event - Browser pageshow event.
     */
    restoreAfterBFCache(event) {
        if (event.persisted) this.registerProbeTool();
    }


    /**
     * Returns fixed readiness data while preserving the invocation cancellation boundary.
     *
     * @param {Object} input - Validated empty probe input.
     * @param {AbortSignal|undefined} signal - Browser invocation signal.
     * @returns {Promise<Object>} Fixed provider readiness data for the shared result boundary.
     */
    async executeProbe(input, signal) {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (signal) signal.removeEventListener("abort", handleAbort);
                resolve();
            }, PROBE_DELAY_MS);

            const handleAbort = () => {
                clearTimeout(timeout);
                reject(signal.reason);
            };

            if (signal) signal.addEventListener("abort", handleAbort, {once: true});
        });

        return {
            data: {
                code: "WEBMCP_PROVIDER_READY",
                provider: "CyberChef",
                tool: READINESS_TOOL_NAME,
            },
        };
    }
}

export default WebMCPWaiter;
