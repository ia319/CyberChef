import { ACTIVE_BUILD_PROFILE } from "../webmcp/BuildProfiles.mjs";
import CollaborationSession from "../webmcp/CollaborationSession.mjs";
import { executeTool } from "../webmcp/ToolExecutor.mjs";
import {
    READINESS_TOOL_CONTRACT,
    READINESS_TOOL_NAME,
    TOOL_CONTRACTS,
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
     * @param {Object} [buildProfile=ACTIVE_BUILD_PROFILE] - Immutable tool registration profile.
     * @param {Object} [handlers={}] - Complete handlers keyed by profile tool name.
     */
    constructor(
        modelContext,
        documentTarget,
        lifecycleTarget,
        buildProfile=ACTIVE_BUILD_PROFILE,
        handlers={}
    ) {
        this.modelContext = modelContext;
        this.documentTarget = documentTarget;
        this.lifecycleTarget = lifecycleTarget;
        this.buildProfile = buildProfile;
        this.handlers = new Map(Object.entries(handlers));
        this.handlers.set(READINESS_TOOL_NAME, this.executeProbe.bind(this));
        this.session = new CollaborationSession(
            Boolean(this.modelContext && typeof this.modelContext.registerTool === "function")
        );

        this.listenersRegistered = false;
        this.registrationController = null;
        this.registrationPromise = null;
        this.registrationState = "idle";
        this.registrationErrorName = null;

        this.handleAppLoaded = this.registerTools.bind(this);
        this.handlePageHide = this.pageHide.bind(this);
        this.handlePageShow = this.restoreAfterBFCache.bind(this);
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
    registerTools() {
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

        let tools;
        try {
            tools = this.buildTools();
        } catch (err) {
            this.registrationController = null;
            this.registrationState = "failed";
            this.registrationErrorName = err.name;
            return Promise.resolve(this.registrationState);
        }

        this.registrationPromise = this.completeRegistration(this.registrationController, tools);

        return this.registrationPromise;
    }


    /**
     * Builds the fixed tool set only when every profile entry has a complete handler.
     *
     * @returns {Object[]} Frozen provider tool definitions.
     */
    buildTools() {
        if (!this.buildProfile || !Array.isArray(this.buildProfile.toolNames)) {
            throw new TypeError("WebMCP build profile must define tool names");
        }

        return this.buildProfile.toolNames.map(name => {
            const contract = name === READINESS_TOOL_NAME ?
                    READINESS_TOOL_CONTRACT : TOOL_CONTRACTS[name],
                handler = this.handlers.get(name);

            if (!contract || typeof handler !== "function") {
                throw new TypeError("WebMCP build profile requires a complete tool handler");
            }

            const routedHandler = contract.requiresSession ?
                (input, signal) => this.session.execute(handler, input, signal) :
                (input, signal) => handler(input, Object.freeze({signal}));

            return Object.freeze({
                name,
                title: contract.title,
                description: contract.description,
                inputSchema: contract.inputSchema,
                annotations: contract.annotations,
                execute: (input, options) => executeTool(
                    contract,
                    routedHandler,
                    input,
                    options
                ),
            });
        });
    }


    /**
     * Completes one registration attempt without letting a stale attempt overwrite a newer one.
     *
     * @param {AbortController} controller - Controller that owns this registration attempt.
     * @param {Object[]} tools - Complete fixed tool definitions for this build.
     * @returns {Promise<string>} The resulting provider registration state.
     */
    async completeRegistration(controller, tools) {
        try {
            await Promise.all(tools.map(tool => this.modelContext.registerTool(tool, {
                signal: controller.signal,
            })));

            if (this.registrationController === controller) {
                this.registrationState = "registered";
            }
        } catch (err) {
            if (this.registrationController === controller) {
                const registrationCancelled = controller.signal.aborted;
                if (!registrationCancelled) controller.abort();
                this.registrationState = registrationCancelled ? "idle" : "failed";
                this.registrationErrorName = registrationCancelled ? null : err.name;
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
     * Aborts the registration so the browser unregisters the fixed tool set.
     */
    unregisterTools() {
        if (this.registrationController) {
            this.registrationController.abort();
        }

        this.registrationController = null;
        this.registrationPromise = null;
        this.registrationState = "idle";
        this.registrationErrorName = null;
    }


    /**
     * Ends collaboration and unregisters tools before the document becomes inactive.
     */
    pageHide() {
        this.session.stop();
        this.unregisterTools();
    }


    /**
     * Restores the static provider after a BFCache page restoration.
     *
     * @param {PageTransitionEvent|Event} event - Browser pageshow event.
     */
    restoreAfterBFCache(event) {
        if (!event.persisted) return;

        this.session.stop();
        this.registerTools();
    }


    /**
     * Returns fixed readiness data while preserving the invocation cancellation boundary.
     *
     * @param {Object} input - Validated empty probe input.
     * @param {Object} invocation - Static invocation context.
     * @returns {Promise<Object>} Fixed provider readiness data for the shared result boundary.
     */
    async executeProbe(input, invocation) {
        const signal = invocation.signal;

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
