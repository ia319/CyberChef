const MAX_ANALYSIS_SAMPLE_BYTES = 1000;
const MAX_ANALYSIS_CANDIDATES = 5;
const MAX_MAGIC_ANALYSIS_DEPTH = 3;
const MAX_MAGIC_ANALYSIS_CRIB_LENGTH = 128;
const DEFAULT_MAGIC_ANALYSIS_OPTIONS = Object.freeze({
    depth: 3,
    intensiveMode: false,
    extensiveLanguageSupport: false,
    crib: "",
});
const MAGIC_ANALYSIS_OPTION_NAMES = new Set(
    Object.keys(DEFAULT_MAGIC_ANALYSIS_OPTIONS)
);


/**
 * Normalizes the bounded Magic configuration shared by UI and Agent analysis.
 *
 * @param {Object} [options={}] - Candidate Magic analysis options.
 * @returns {Object} Immutable validated Magic analysis options.
 * @throws {TypeError} When an option is unsupported or invalid.
 */
function createMagicAnalysisOptions(options={}) {
    if (!options || typeof options !== "object" || Array.isArray(options) ||
        Object.keys(options).some(key => !MAGIC_ANALYSIS_OPTION_NAMES.has(key))) {
        throw new TypeError("Magic analysis options are invalid");
    }

    const normalized = {
        depth: options.depth ?? DEFAULT_MAGIC_ANALYSIS_OPTIONS.depth,
        intensiveMode: options.intensiveMode ??
            DEFAULT_MAGIC_ANALYSIS_OPTIONS.intensiveMode,
        extensiveLanguageSupport: options.extensiveLanguageSupport ??
            DEFAULT_MAGIC_ANALYSIS_OPTIONS.extensiveLanguageSupport,
        crib: options.crib ?? DEFAULT_MAGIC_ANALYSIS_OPTIONS.crib,
    };
    if (!Number.isSafeInteger(normalized.depth) || normalized.depth < 0 ||
        normalized.depth > MAX_MAGIC_ANALYSIS_DEPTH ||
        typeof normalized.intensiveMode !== "boolean" ||
        typeof normalized.extensiveLanguageSupport !== "boolean" ||
        typeof normalized.crib !== "string" ||
        normalized.crib.length > MAX_MAGIC_ANALYSIS_CRIB_LENGTH) {
        throw new TypeError("Magic analysis options are invalid");
    }
    if (normalized.crib) {
        try {
            new RegExp(normalized.crib, "i");
        } catch {
            throw new TypeError("Magic analysis options are invalid");
        }
    }
    return Object.freeze(normalized);
}

export {
    MAX_ANALYSIS_CANDIDATES,
    MAX_ANALYSIS_SAMPLE_BYTES,
    MAX_MAGIC_ANALYSIS_CRIB_LENGTH,
    MAX_MAGIC_ANALYSIS_DEPTH,
    createMagicAnalysisOptions,
};
