import {analysisTargetMatches} from "../analysis/AnalysisCoordinator.mjs";
import {OPERATION_CATALOG} from "./OperationCatalog.mjs";
import {
    TOOL_INPUT_MAX_DEPTH,
    TOOL_INPUT_MAX_NODES,
} from "./ToolInput.mjs";
import {copyJsonValue} from "./JsonValue.mjs";


const ANALYSIS_CANDIDATE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const MAX_STORED_ANALYSIS_CANDIDATES = 320;


/**
 * Checks one collaboration session identity without assigning meaning to its value.
 *
 * @param {*} sessionEpoch - Candidate page-scoped session identity.
 * @returns {boolean} Whether the identity can be bound to a candidate.
 */
function isSessionEpoch(sessionEpoch) {
    return Number.isSafeInteger(sessionEpoch) && sessionEpoch >= 0 ||
        typeof sessionEpoch === "string" && sessionEpoch.length > 0;
}


/**
 * Detaches one trusted Magic Recipe into the existing Recipe patch command shape.
 *
 * @param {*} candidate - Internal Magic candidate.
 * @returns {Object|null} Candidate changes and Operation names, or null when unusable.
 */
function createCandidatePatch(candidate) {
    if (!Array.isArray(candidate?.recipe) || candidate.recipe.length < 1) return null;

    let recipe;
    try {
        recipe = copyJsonValue(
            candidate.recipe,
            TOOL_INPUT_MAX_DEPTH,
            TOOL_INPUT_MAX_NODES
        ).value;
    } catch {
        return null;
    }

    const changes = [],
        operationNames = [];
    for (const step of recipe) {
        if (!step || typeof step !== "object" || Array.isArray(step) ||
            typeof step.op !== "string" || !OPERATION_CATALOG.getOperation(step.op) ||
            !Array.isArray(step.args)) return null;
        changes.push(Object.freeze({
            type: "insert",
            operation: step.op,
            arguments: Object.freeze(step.args),
        }));
        operationNames.push(step.op);
    }

    return Object.freeze({
        changes: Object.freeze(changes),
        operationNames: Object.freeze(operationNames),
    });
}


/**
 * Keeps exact Magic candidate Recipes inside the page while exposing only opaque references.
 */
class AnalysisCandidateStore {
    #idFactory;
    #records = new Map();

    /**
     * @param {Object} [options={}] - Candidate identity integration options.
     * @param {Function} [options.idFactory] - Opaque identifier source.
     */
    constructor(options={}) {
        this.#idFactory = options.idFactory ?? (() => globalThis.crypto?.randomUUID());
        if (typeof this.#idFactory !== "function") {
            throw new TypeError("Analysis candidate store requires an identifier source");
        }
    }

    /**
     * Stores complete candidate Recipes under page-issued references.
     *
     * @param {Object} analysis - Settled analysis snapshot with exact Output provenance.
     * @param {Object} provenance - Original current Output provenance object.
     * @param {Object[]} candidates - Trusted internal Magic candidates in ranked order.
     * @param {number|string} sessionEpoch - Active collaboration session identity.
     * @returns {Object[]} Safe ranked references without candidate arguments.
     */
    register(analysis, provenance, candidates, sessionEpoch) {
        if (!analysis || !Number.isSafeInteger(analysis.analysisId) || analysis.analysisId < 1 ||
            !analysisTargetMatches(analysis.target, provenance) ||
            !Array.isArray(candidates) || !isSessionEpoch(sessionEpoch)) {
            throw new TypeError("Analysis candidates cannot be registered");
        }

        const pending = [];
        for (let index = 0; index < candidates.length; index++) {
            const patch = createCandidatePatch(candidates[index]);
            if (!patch) continue;
            const candidateId = this.#idFactory();
            if (typeof candidateId !== "string" ||
                !ANALYSIS_CANDIDATE_ID_PATTERN.test(candidateId) ||
                this.#records.has(candidateId) ||
                pending.some(candidate => candidate.candidateId === candidateId)) {
                throw new TypeError("Analysis candidate identity is invalid");
            }
            pending.push({
                candidateId,
                rank: index + 1,
                operationNames: patch.operationNames,
                record: Object.freeze({
                    target: provenance,
                    sessionEpoch,
                    changes: patch.changes,
                }),
            });
        }

        for (const candidate of pending) {
            while (this.#records.size >= MAX_STORED_ANALYSIS_CANDIDATES) {
                this.#records.delete(this.#records.keys().next().value);
            }
            this.#records.set(candidate.candidateId, candidate.record);
        }
        return Object.freeze(pending.map(candidate => Object.freeze({
            candidateId: candidate.candidateId,
            rank: candidate.rank,
            operationNames: candidate.operationNames,
        })));
    }

    /**
     * Resolves one reference only inside its original session and Recipe revision.
     *
     * @param {string} candidateId - Page-issued candidate identity.
     * @param {number|string} sessionEpoch - Active collaboration session identity.
     * @param {number} expectedRevision - Recipe revision supplied for the mutation.
     * @returns {Object|null} Internal candidate record or null when stale or unknown.
     */
    resolve(candidateId, sessionEpoch, expectedRevision) {
        const record = this.#records.get(candidateId);
        if (!record || record.sessionEpoch !== sessionEpoch ||
            record.target.recipeRevision !== expectedRevision) return null;
        return record;
    }

    /**
     * Removes every candidate when its page-scoped authorization context changes.
     *
     * @returns {void}
     */
    clear() {
        this.#records.clear();
    }
}


export {
    ANALYSIS_CANDIDATE_ID_PATTERN,
    AnalysisCandidateStore,
};
