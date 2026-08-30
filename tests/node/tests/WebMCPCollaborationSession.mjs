import assert from "assert";
import CollaborationSession, {
    COLLABORATION_SESSION_STATE,
} from "../../../src/web/webmcp/CollaborationSession.mjs";
import { executeTool } from "../../../src/web/webmcp/ToolExecutor.mjs";
import { TOOL_ERROR_CODE } from "../../../src/web/webmcp/ToolResult.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const CONTRACT = Object.freeze({
    inputSchema: Object.freeze({
        type: "object",
        properties: Object.freeze({}),
        required: Object.freeze([]),
        additionalProperties: false,
    }),
});


TestRegister.addApiTests([
    it("WebMCPCollaborationSession: should remain unavailable without WebMCP", () => {
        const session = new CollaborationSession(false);

        assert.deepStrictEqual(session.start(), {
            state: COLLABORATION_SESSION_STATE.UNAVAILABLE,
            sessionEpoch: null,
        });
        assert.throws(
            () => session.createInvocation(),
            err => err.code === TOOL_ERROR_CODE.COLLABORATION_DISABLED
        );
    }),

    it("WebMCPCollaborationSession: should create one epoch per activation", () => {
        const epochs = ["session-a", "session-b"],
            session = new CollaborationSession(true, () => epochs.shift());
        let changeCount = 0;
        session.addEventListener("change", () => changeCount++);

        assert.deepStrictEqual(session.getState(), {
            state: COLLABORATION_SESSION_STATE.OFF,
            sessionEpoch: null,
        });
        assert.deepStrictEqual(session.start(), {
            state: COLLABORATION_SESSION_STATE.ACTIVE,
            sessionEpoch: "session-a",
        });
        assert.equal(session.start().sessionEpoch, "session-a");
        assert.deepStrictEqual(session.stop(), {
            state: COLLABORATION_SESSION_STATE.OFF,
            sessionEpoch: null,
        });
        assert.equal(session.stop().state, COLLABORATION_SESSION_STATE.OFF);
        assert.equal(session.start().sessionEpoch, "session-b");
        assert.equal(changeCount, 3);
    }),

    it("WebMCPCollaborationSession: should reject protected tools while inactive", async () => {
        const session = new CollaborationSession(true),
            result = await executeTool(CONTRACT, session.execute.bind(session, async () => ({
                data: {status: "unexpected"},
            })), {});

        assert.equal(result.error.code, TOOL_ERROR_CODE.COLLABORATION_DISABLED);
    }),

    it("WebMCPCollaborationSession: should stop work before a visible side effect", async () => {
        const session = new CollaborationSession(true);
        let continueHandler,
            sideEffectCommitted = false;
        const handlerPending = new Promise(resolve => {
            continueHandler = resolve;
        });

        session.start();
        const execution = executeTool(CONTRACT, session.execute.bind(session, async (input, invocation) => {
            await handlerPending;
            invocation.checkpoint();
            sideEffectCommitted = true;
            return {data: {status: "committed"}};
        }), {});

        session.stop();
        continueHandler();
        const result = await execution;

        assert.equal(result.error.code, TOOL_ERROR_CODE.SESSION_ENDED);
        assert.equal(sideEffectCommitted, false);
    }),

    it("WebMCPCollaborationSession: should discard derived data after Stop", async () => {
        const session = new CollaborationSession(true);
        let finishHandler;
        const handlerPending = new Promise(resolve => {
            finishHandler = resolve;
        });

        session.start();
        const execution = executeTool(CONTRACT, session.execute.bind(session, async () => {
            await handlerPending;
            return {data: {status: "SECRET_CANARY"}};
        }), {});

        session.stop();
        finishHandler();
        const result = await execution;

        assert.equal(result.error.code, TOOL_ERROR_CODE.SESSION_ENDED);
        assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
    }),

    it("WebMCPCollaborationSession: should cancel active session work on Stop", async () => {
        const session = new CollaborationSession(true);
        let handlerSignal;

        session.start();
        const execution = executeTool(CONTRACT, session.execute.bind(session, async (input, invocation) => {
            handlerSignal = invocation.signal;
            await new Promise((resolve, reject) => {
                invocation.signal.addEventListener("abort", () => reject(invocation.signal.reason), {once: true});
            });
            return {data: {status: "unexpected"}};
        }), {});

        session.stop();
        const result = await execution;

        assert.equal(result.error.code, TOOL_ERROR_CODE.SESSION_ENDED);
        assert.equal(handlerSignal.aborted, true);
    }),

    it("WebMCPCollaborationSession: should preserve browser invocation cancellation", async () => {
        const session = new CollaborationSession(true),
            invocationController = new AbortController();
        let handlerSignal;

        session.start();
        const execution = executeTool(CONTRACT, session.execute.bind(session, async (input, invocation) => {
            handlerSignal = invocation.signal;
            await new Promise((resolve, reject) => {
                invocation.signal.addEventListener("abort", () => reject(invocation.signal.reason), {once: true});
            });
            return {data: {status: "unexpected"}};
        }), {}, {signal: invocationController.signal});

        invocationController.abort();

        await assert.rejects(execution, err => err.name === "AbortError");
        assert.equal(handlerSignal.aborted, true);
        assert.equal(session.getState().state, COLLABORATION_SESSION_STATE.ACTIVE);
    }),
]);
