import assert from "assert";
import WebMCPWaiter from "../../../src/web/waiters/WebMCPWaiter.mjs";
import {
    BUILD_PROFILES,
    PROFILE_NAME,
} from "../../../src/web/webmcp/BuildProfiles.mjs";
import {
    READINESS_TOOL_CONTRACT,
    READINESS_TOOL_NAME,
    TOOL_NAME,
} from "../../../src/web/webmcp/ToolDefinitions.mjs";
import { TOOL_ERROR_CODE } from "../../../src/web/webmcp/ToolResult.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const waitForEventHandler = () => new Promise(resolve => setTimeout(resolve, 0));

const RECIPE_PROFILE_HANDLERS = Object.freeze({
    [TOOL_NAME.SEARCH_OPERATIONS]: async () => ({data: {matches: []}}),
    [TOOL_NAME.GET_OPERATION_DETAILS]: async () => ({data: {operation: null}}),
    [TOOL_NAME.GET_RECIPE_STATE]: async (input, invocation) => ({
        data: {status: "ready"},
        state: {sessionEpoch: invocation.sessionEpoch},
    }),
    [TOOL_NAME.APPLY_RECIPE_PATCH]: async () => ({data: {status: "committed"}}),
});


TestRegister.addApiTests([
    it("WebMCPWaiter: should no-op when WebMCP is unsupported", async () => {
        const waiter = new WebMCPWaiter(null, new EventTarget(), new EventTarget());

        assert.equal(await waiter.registerTools(), "unsupported");
        assert.equal(waiter.registrationController, null);
        assert.equal(waiter.session.getState().state, "unavailable");
    }),

    it("WebMCPWaiter: should register one fixed probe after app load", async () => {
        const registrations = [],
            modelContext = {
                registerTool: async (tool, options) => registrations.push({tool, options}),
            },
            documentTarget = new EventTarget(),
            waiter = new WebMCPWaiter(modelContext, documentTarget, new EventTarget());

        waiter.setup();
        waiter.setup();
        documentTarget.dispatchEvent(new Event("apploaded"));
        await waitForEventHandler();
        await waiter.registerTools();

        assert.equal(registrations.length, 1);
        assert.equal(registrations[0].tool.name, READINESS_TOOL_NAME);
        assert.equal(registrations[0].tool.title, READINESS_TOOL_CONTRACT.title);
        assert.equal(registrations[0].tool.description, READINESS_TOOL_CONTRACT.description);
        assert.strictEqual(registrations[0].tool.inputSchema, READINESS_TOOL_CONTRACT.inputSchema);
        assert.strictEqual(registrations[0].tool.annotations, READINESS_TOOL_CONTRACT.annotations);
        assert.equal(registrations[0].options.signal.aborted, false);
        assert.equal(waiter.registrationState, "registered");

        const result = await registrations[0].tool.execute({});

        assert.deepStrictEqual(result, {
            version: "1",
            ok: true,
            data: {
                code: "WEBMCP_PROVIDER_READY",
                provider: "CyberChef",
                tool: READINESS_TOOL_NAME,
            },
        });
    }),

    it("WebMCPWaiter: should reject invalid probe input through the shared boundary", async () => {
        let registeredTool;
        const modelContext = {
                registerTool: async tool => {
                    registeredTool = tool;
                },
            },
            waiter = new WebMCPWaiter(modelContext, new EventTarget(), new EventTarget());

        await waiter.registerTools();
        const result = await registeredTool.execute({unexpected: "SECRET_CANARY"});

        assert.equal(result.error.code, TOOL_ERROR_CODE.INVALID_REQUEST);
        assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
    }),

    it("WebMCPWaiter: should separate registration and invocation cancellation", async () => {
        let registeredTool,
            registrationSignal;
        const modelContext = {
                registerTool: async (tool, options) => {
                    registeredTool = tool;
                    registrationSignal = options.signal;
                },
            },
            waiter = new WebMCPWaiter(modelContext, new EventTarget(), new EventTarget()),
            invocationController = new AbortController();

        await waiter.registerTools();
        const execution = registeredTool.execute({}, {
            signal: invocationController.signal,
        });

        invocationController.abort();

        await assert.rejects(execution, err => err.name === "AbortError");
        assert.equal(registrationSignal.aborted, false);
        assert.equal(waiter.registrationState, "registered");

        waiter.unregisterTools();

        assert.equal(registrationSignal.aborted, true);
        assert.equal(waiter.registrationState, "idle");
    }),

    it("WebMCPWaiter: should re-register after BFCache restoration", async () => {
        const registrationSignals = [],
            modelContext = {
                registerTool: async (tool, options) => registrationSignals.push(options.signal),
            },
            lifecycleTarget = new EventTarget(),
            waiter = new WebMCPWaiter(modelContext, new EventTarget(), lifecycleTarget);

        waiter.setup();
        await waiter.registerTools();
        waiter.session.start();
        lifecycleTarget.dispatchEvent(new Event("pagehide"));

        const pageShow = new Event("pageshow");
        Object.defineProperty(pageShow, "persisted", {value: true});
        lifecycleTarget.dispatchEvent(pageShow);
        await waitForEventHandler();

        assert.equal(registrationSignals.length, 2);
        assert.equal(registrationSignals[0].aborted, true);
        assert.equal(registrationSignals[1].aborted, false);
        assert.equal(waiter.registrationState, "registered");
        assert.equal(waiter.session.getState().state, "off");
    }),

    it("WebMCPWaiter: should register a fixed profile without reacting to session state", async () => {
        const registrations = [],
            modelContext = {
                registerTool: async (tool, options) => registrations.push({tool, options}),
            },
            waiter = new WebMCPWaiter(
                modelContext,
                new EventTarget(),
                new EventTarget(),
                BUILD_PROFILES[PROFILE_NAME.RECIPE],
                RECIPE_PROFILE_HANDLERS
            );

        await waiter.registerTools();

        assert.deepStrictEqual(
            registrations.map(registration => registration.tool.name),
            BUILD_PROFILES[PROFILE_NAME.RECIPE].toolNames
        );
        assert.equal(new Set(registrations.map(registration => registration.options.signal)).size, 1);

        const searchTool = registrations.find(({tool}) => tool.name === TOOL_NAME.SEARCH_OPERATIONS).tool,
            stateTool = registrations.find(({tool}) => tool.name === TOOL_NAME.GET_RECIPE_STATE).tool;

        assert.equal((await searchTool.execute({query: "hex"})).ok, true);
        assert.equal(
            (await stateTool.execute({})).error.code,
            TOOL_ERROR_CODE.COLLABORATION_DISABLED
        );

        const activeSession = waiter.session.start(),
            stateResult = await stateTool.execute({});
        waiter.session.stop();

        assert.equal(stateResult.ok, true);
        assert.equal(stateResult.state.sessionEpoch, activeSession.sessionEpoch);
        assert.equal(registrations.length, 4);
    }),

    it("WebMCPWaiter: should reject profiles with missing handlers", async () => {
        const registrations = [],
            waiter = new WebMCPWaiter(
                {registerTool: async tool => registrations.push(tool)},
                new EventTarget(),
                new EventTarget(),
                BUILD_PROFILES[PROFILE_NAME.RECIPE]
            );

        assert.equal(await waiter.registerTools(), "failed");
        assert.equal(waiter.registrationErrorName, "TypeError");
        assert.equal(registrations.length, 0);
    }),

    it("WebMCPWaiter: should contain registration rejection and remove partial registrations", async () => {
        let shouldReject = true;
        const registrationSignals = [];
        const modelContext = {
                registerTool: async (tool, options) => {
                    registrationSignals.push(options.signal);
                    if (shouldReject && tool.name === TOOL_NAME.GET_OPERATION_DETAILS) {
                        throw new DOMException("Blocked", "NotAllowedError");
                    }
                },
            },
            waiter = new WebMCPWaiter(
                modelContext,
                new EventTarget(),
                new EventTarget(),
                BUILD_PROFILES[PROFILE_NAME.RECIPE],
                RECIPE_PROFILE_HANDLERS
            );

        assert.equal(await waiter.registerTools(), "failed");
        assert.equal(waiter.registrationState, "failed");
        assert.equal(waiter.registrationErrorName, "NotAllowedError");
        assert.equal(waiter.registrationController, null);
        assert.equal(waiter.registrationPromise, null);
        assert.equal(registrationSignals.length, 4);
        assert.equal(new Set(registrationSignals).size, 1);
        assert.equal(registrationSignals.every(signal => signal.aborted), true);

        shouldReject = false;

        assert.equal(await waiter.registerTools(), "registered");
        assert.equal(waiter.registrationErrorName, null);
        assert.equal(registrationSignals.length, 8);
    }),
]);
