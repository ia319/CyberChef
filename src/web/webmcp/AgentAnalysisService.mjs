import {
    ANALYSIS_DECISION,
    ANALYSIS_OWNER,
    ANALYSIS_STATE,
    analysisTargetMatches,
} from "../analysis/AnalysisCoordinator.mjs";
import {
    AGENT_ANALYSIS_ERROR_CODE,
    AgentAnalysisError,
} from "./AgentAnalysisError.mjs";
import {AnalysisCandidateStore} from "./AnalysisCandidateStore.mjs";


const COMPLETABLE_DECISIONS = new Set([
    ANALYSIS_DECISION.CACHED,
    ANALYSIS_DECISION.JOINED,
    ANALYSIS_DECISION.STARTED,
]);
const TERMINAL_ERROR_CODES = Object.freeze({
    [ANALYSIS_STATE.CANCELLED]: AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED,
    [ANALYSIS_STATE.FAILED]: AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED,
    [ANALYSIS_STATE.NO_SUGGESTION]: AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_EMPTY,
    [ANALYSIS_STATE.STALE]: AGENT_ANALYSIS_ERROR_CODE.STALE_OUTPUT_ANALYSIS,
    [ANALYSIS_STATE.TIMED_OUT]: AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_TIMEOUT,
});


/**
 * Coordinates one authorized Agent inspection with the shared Output analysis lifecycle.
 */
class AgentAnalysisService {
    #candidateStore;
    #manager;

    /**
     * @param {Object} manager - Output and Background Worker services.
     * @param {Object} [options={}] - Candidate storage integration options.
     * @param {AnalysisCandidateStore} [options.candidateStore] - Page-local candidate owner.
     */
    constructor(manager, options={}) {
        if (!manager?.output || !manager?.background ||
            typeof manager.output.captureAnalysisInput !== "function" ||
            typeof manager.output.isCurrentOutputProvenance !== "function" ||
            typeof manager.background.invalidateAnalysis !== "function" ||
            typeof manager.background.getMagicDecision !== "function" ||
            typeof manager.background.magic !== "function") {
            throw new TypeError("Agent analysis service requires complete Output analysis services");
        }
        this.#manager = manager;
        this.#candidateStore = options.candidateStore ?? new AnalysisCandidateStore();
        if (!this.#candidateStore ||
            typeof this.#candidateStore.register !== "function" ||
            typeof this.#candidateStore.resolve !== "function" ||
            typeof this.#candidateStore.clear !== "function") {
            throw new TypeError("Agent analysis service requires candidate storage");
        }
    }

    /**
     * Reuses, joins, or starts analysis for one exact fresh visible Output.
     *
     * @param {number} bakeId - Completed Run identity supplied by the Agent.
     * @param {Object} magicOptions - Validated bounded Magic analysis options.
     * @param {Object} invocation - Active collaboration invocation guard.
     * @returns {Promise<Object>} Decision, settled analysis, and trusted internal candidates.
     * @throws {AgentAnalysisError} When the requested Output cannot produce an approved result.
     */
    async inspectCurrentOutput(bakeId, magicOptions, invocation) {
        if (!Number.isSafeInteger(bakeId) || bakeId < 1 ||
            !invocation || typeof invocation.checkpoint !== "function" ||
            typeof invocation.consumeOutputAnalysis !== "function" ||
            !(invocation.signal instanceof AbortSignal)) {
            throw new AgentAnalysisError(
                AGENT_ANALYSIS_ERROR_CODE.STALE_OUTPUT_ANALYSIS
            );
        }
        invocation.checkpoint();

        let analysisInput;
        try {
            analysisInput = await this.#manager.output.captureAnalysisInput(
                bakeId,
                invocation.signal
            );
        } catch (err) {
            if (invocation.signal.aborted) throw invocation.signal.reason;
            throw new AgentAnalysisError(AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED);
        }
        invocation.checkpoint();

        const provenance = analysisInput?.provenance,
            sample = analysisInput?.sample;
        if (!provenance || provenance.bakeId !== bakeId) {
            throw new AgentAnalysisError(
                AGENT_ANALYSIS_ERROR_CODE.STALE_OUTPUT_ANALYSIS
            );
        }
        if (!(sample instanceof ArrayBuffer)) {
            throw new AgentAnalysisError(AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED);
        }
        if (sample.byteLength === 0) {
            throw new AgentAnalysisError(AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_EMPTY);
        }

        this.#manager.background.invalidateAnalysis(provenance);
        let expectedDecision;
        try {
            expectedDecision = this.#manager.background.getMagicDecision(
                provenance,
                magicOptions
            ).decision;
        } catch {
            throw new AgentAnalysisError(AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED);
        }
        if (expectedDecision === ANALYSIS_DECISION.STARTED) {
            invocation.consumeOutputAnalysis();
        }

        let request;
        try {
            request = this.#manager.background.magic(
                sample,
                provenance,
                ANALYSIS_OWNER.AGENT,
                invocation.signal,
                magicOptions
            );
        } catch (err) {
            if (invocation.signal.aborted) throw invocation.signal.reason;
            throw new AgentAnalysisError(AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED);
        }
        if (!request || request.decision !== expectedDecision ||
            !COMPLETABLE_DECISIONS.has(request.decision) ||
            !(request.completion instanceof Promise)) {
            throw new AgentAnalysisError(AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED);
        }

        let completion;
        try {
            completion = await request.completion;
        } catch (err) {
            if (invocation.signal.aborted) throw invocation.signal.reason;
            throw new AgentAnalysisError(AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED);
        }
        invocation.checkpoint();

        const analysis = completion?.analysis;
        if (!analysis || !analysisTargetMatches(analysis.target, provenance) ||
            !this.#manager.output.isCurrentOutputProvenance(provenance)) {
            throw new AgentAnalysisError(
                AGENT_ANALYSIS_ERROR_CODE.STALE_OUTPUT_ANALYSIS
            );
        }
        if (analysis.terminalState !== ANALYSIS_STATE.SIGNALS_READY) {
            throw new AgentAnalysisError(
                TERMINAL_ERROR_CODES[analysis.terminalState] ??
                    AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED
            );
        }
        if (!Array.isArray(completion.value) || completion.value.length < 1) {
            throw new AgentAnalysisError(AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED);
        }

        let candidateReferences;
        try {
            candidateReferences = this.#candidateStore.register(
                analysis,
                provenance,
                completion.value,
                invocation.sessionEpoch
            );
        } catch {
            throw new AgentAnalysisError(AGENT_ANALYSIS_ERROR_CODE.ANALYSIS_FAILED);
        }

        return Object.freeze({
            decision: request.decision,
            analysis,
            candidates: completion.value,
            candidateReferences,
        });
    }

    /**
     * Resolves one Magic candidate into exact internal Recipe changes.
     *
     * @param {string} candidateId - Opaque candidate identity returned by inspect_output.
     * @param {number} expectedRevision - Current Recipe revision supplied by the Agent.
     * @param {number|string} sessionEpoch - Active collaboration session identity.
     * @returns {Object} Internal Recipe patch input without candidate parameters in tool data.
     * @throws {AgentAnalysisError} When the candidate no longer belongs to current state.
     */
    resolveCandidatePatch(candidateId, expectedRevision, sessionEpoch) {
        const candidate = this.#candidateStore.resolve(
            candidateId,
            sessionEpoch,
            expectedRevision
        );
        if (!candidate || !this.#manager.output.isCurrentOutputProvenance(candidate.target)) {
            throw new AgentAnalysisError(
                AGENT_ANALYSIS_ERROR_CODE.STALE_OUTPUT_ANALYSIS
            );
        }
        return Object.freeze({
            expectedRevision,
            changes: candidate.changes,
        });
    }

    /**
     * Invalidates candidate references after their page-scoped state changes.
     *
     * @returns {void}
     */
    invalidateCandidates() {
        this.#candidateStore.clear();
    }
}

export {
    AgentAnalysisService,
};
