import {ANALYSIS_STATE} from "../analysis/AnalysisCoordinator.mjs";
import {OPERATION_CATALOG} from "./OperationCatalog.mjs";


const UNKNOWN_ANALYSIS_ID = "unknown";
const MAX_ANALYSIS_OPERATION_NAMES = 3;
const INPUT_GENERATION_PATTERN = /^\d+:\d+$/;
const COMMON_LANGUAGE_IDS = new Set([
    "en", "ru", "de", "ja", "es", "fr", "pt", "it", "zh", "fa",
    "pl", "tr", "nl", "ko", "cs", "ar", "vi", "el", "sv", "hu",
    "ro", "id", "sk", "da", "fi", "th", "bg", "he", "uk", "lt",
    "nn", "hr", "no", "sr", "ca", "sl", "lv", "et", "hi",
]);
const DOCUMENT_MIME_TYPES = new Set([
    "application/eps",
    "application/msword",
    "application/pdf",
    "application/postscript",
    "application/rtf",
]);
const ARCHIVE_MIME_TYPES = new Set([
    "application/gzip",
    "application/vnd.rar",
    "application/x-7z-compressed",
    "application/x-bzip2",
    "application/x-rar-compressed",
    "application/x-tar",
    "application/zip",
]);
const EXECUTABLE_MIME_TYPES = new Set([
    "application/java-vm",
    "application/vnd.microsoft.portable-executable",
    "application/wasm",
    "application/x-executable",
]);


/**
 * Validates every content-free identity copied into a tool result.
 *
 * @param {*} target - Candidate completed Output target.
 * @returns {boolean} Whether the target contains the required identities.
 */
function isSerializableTarget(target) {
    return !!target &&
        Number.isSafeInteger(target.bakeId) && target.bakeId >= 1 &&
        Number.isSafeInteger(target.recipeRevision) && target.recipeRevision >= 0 &&
        Number.isSafeInteger(target.inputTabId) && target.inputTabId >= 1 &&
        typeof target.inputGeneration === "string" &&
            INPUT_GENERATION_PATTERN.test(target.inputGeneration) &&
        Number.isSafeInteger(target.inputRevision) && target.inputRevision >= 0 &&
        Number.isSafeInteger(target.executionOptionsVersion) &&
            target.executionOptionsVersion >= 0 &&
        Number.isSafeInteger(target.outputTabId) && target.outputTabId >= 1 &&
        Number.isSafeInteger(target.outputGeneration) && target.outputGeneration >= 1 &&
        Number.isSafeInteger(target.outputVersion) && target.outputVersion >= 1 &&
        target.terminalState === "completed";
}


/**
 * Maps an exact Magic entropy value to the same coarse bands used by its UI presentation.
 *
 * @param {*} value - Candidate entropy value.
 * @returns {string} Fixed entropy band.
 */
function getEntropyBand(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 8) {
        return UNKNOWN_ANALYSIS_ID;
    }
    if (value < 3) return "low";
    if (value < 5) return "medium";
    return "high";
}


/**
 * Reduces a detected MIME value to a fixed broad category.
 *
 * @param {*} fileType - Magic file type candidate.
 * @returns {string} Fixed detected type identifier.
 */
function getDetectedTypeId(fileType) {
    const mime = typeof fileType?.mime === "string" ? fileType.mime.toLowerCase() : "";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("font/") || mime.startsWith("application/font-")) return "font";
    if (mime.startsWith("text/") || DOCUMENT_MIME_TYPES.has(mime) ||
        mime.includes("officedocument")) return "document";
    if (ARCHIVE_MIME_TYPES.has(mime)) return "archive";
    if (EXECUTABLE_MIME_TYPES.has(mime)) return "executable";
    return UNKNOWN_ANALYSIS_ID;
}


/**
 * Accepts a language identifier only when the non-extensive Magic profile can produce it.
 *
 * @param {*} languageScores - Magic language score candidates.
 * @returns {string} Fixed language identifier or unknown.
 */
function getTopLanguageId(languageScores) {
    const topLanguage = Array.isArray(languageScores) ? languageScores[0] : null;
    return topLanguage && typeof topLanguage.probability === "number" &&
        Number.isFinite(topLanguage.probability) && topLanguage.probability > 0 &&
        COMMON_LANGUAGE_IDS.has(topLanguage.lang) ? topLanguage.lang : UNKNOWN_ANALYSIS_ID;
}


/**
 * Selects distinct exact Operation names from an internal Magic collection.
 *
 * @param {*} items - Candidate Recipe steps or matching Operation records.
 * @returns {string[]} Bounded static Operation names.
 */
function getOperationNames(items) {
    if (!Array.isArray(items)) return [];
    const names = [];
    for (const item of items) {
        const name = item?.op;
        if (typeof name !== "string" || !OPERATION_CATALOG.getOperation(name) ||
            names.includes(name)) continue;
        names.push(name);
        if (names.length === MAX_ANALYSIS_OPERATION_NAMES) break;
    }
    return names;
}


/**
 * Reconstructs the approved WebMCP projection from one completed internal analysis.
 *
 * @param {Object} analysis - Analysis coordinator snapshot.
 * @param {Object[]} candidates - Trusted internal Magic candidates.
 * @returns {Object} Bounded analysis data without raw or high-precision fields.
 */
function serializeOutputAnalysis(analysis, candidates) {
    if (!analysis || analysis.terminalState !== ANALYSIS_STATE.SIGNALS_READY ||
        !Number.isSafeInteger(analysis.analysisId) || analysis.analysisId < 1 ||
        !Array.isArray(candidates) || candidates.length < 1) {
        throw new TypeError("Output analysis cannot be serialized");
    }
    const target = analysis.target,
        topCandidate = candidates[0];
    if (!isSerializableTarget(target) ||
        typeof topCandidate !== "object" || topCandidate === null) {
        throw new TypeError("Output analysis cannot be serialized");
    }

    return {
        analysisId: analysis.analysisId,
        analysisState: ANALYSIS_STATE.SIGNALS_READY,
        bakeId: target.bakeId,
        recipeRevision: target.recipeRevision,
        inputTabId: target.inputTabId,
        inputGeneration: target.inputGeneration,
        inputRevision: target.inputRevision,
        executionOptionsVersion: target.executionOptionsVersion,
        outputTabId: target.outputTabId,
        outputGeneration: target.outputGeneration,
        outputVersion: target.outputVersion,
        isUtf8: topCandidate.isUTF8 === true,
        detectedTypeId: getDetectedTypeId(topCandidate.fileType),
        entropyBand: getEntropyBand(topCandidate.entropy),
        topLanguageId: getTopLanguageId(topCandidate.languageScores),
        matchingOperationNames: getOperationNames(topCandidate.matchingOps),
        candidateOperationNames: getOperationNames(topCandidate.recipe),
    };
}


export {
    MAX_ANALYSIS_OPERATION_NAMES,
    UNKNOWN_ANALYSIS_ID,
    getDetectedTypeId,
    getEntropyBand,
    getTopLanguageId,
    serializeOutputAnalysis,
};
