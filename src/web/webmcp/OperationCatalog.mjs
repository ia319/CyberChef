import OperationConfig from "../../core/config/OperationConfig.json" with { type: "json" };
import { fuzzyMatch } from "../../core/lib/FuzzyMatch.mjs";

const OPERATION_DESCRIPTION_MAX_CODE_POINTS = 240;
const OPERATION_SEARCH_DEFAULT_LIMIT = 5;
const OPERATION_SEARCH_MAX_LIMIT = 10;
const OPERATION_SEARCH_MAX_QUERY_CODE_POINTS = 128;

const HTML_ENTITY_VALUES = Object.freeze({
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
});


/**
 * Decodes the HTML entities used by Operation descriptions without a DOM.
 *
 * @param {string} value - Text containing named or numeric HTML entities.
 * @returns {string} Text with supported entities decoded.
 */
function decodeHtmlEntities(value) {
    return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (entity, decimal, hexadecimal, named) => {
        if (named) return HTML_ENTITY_VALUES[named.toLowerCase()] ?? entity;

        const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff ||
            codePoint >= 0xd800 && codePoint <= 0xdfff) {
            return "";
        }
        return String.fromCodePoint(codePoint);
    });
}


/**
 * Converts fixed Operation HTML descriptions into bounded plain text.
 *
 * @param {*} description - Description value from generated configuration.
 * @returns {string} Sanitized description text.
 */
function sanitizeOperationDescription(description) {
    const source = typeof description === "string" ? description : "",
        withoutActiveContent = source
            .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, " ")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/giu, " "),
        plainText = decodeHtmlEntities(withoutActiveContent.replace(/<[^>]*>/gu, " "))
            .replace(/\s+/gu, " ")
            .trim(),
        codePoints = [...plainText];

    if (codePoints.length <= OPERATION_DESCRIPTION_MAX_CODE_POINTS) return plainText;
    return codePoints.slice(0, OPERATION_DESCRIPTION_MAX_CODE_POINTS - 1).join("") + "…";
}


/**
 * Creates an immutable static Operation catalog with stable search behavior.
 *
 * @param {Object} config - Generated Operation configuration keyed by exact name.
 * @returns {Object} Catalog lookup and search interface.
 */
function createOperationCatalog(config=OperationConfig) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new TypeError("Operation configuration must be an object");
    }

    const entries = Object.entries(config).map(([name, operation]) => Object.freeze({
            name,
            description: sanitizeOperationDescription(operation?.description),
            module: typeof operation?.module === "string" ? operation.module : "",
            inputType: typeof operation?.inputType === "string" ? operation.inputType : "",
            coreOutputType: typeof operation?.coreOutputType === "string" ? operation.coreOutputType : "",
            presentType: typeof operation?.outputType === "string" ? operation.outputType : "",
            manualBake: operation?.manualBake === true,
            flowControl: operation?.flowControl === true,
        })),
        entriesByName = new Map(entries.map(entry => [entry.name, entry])),
        names = Object.freeze(entries.map(entry => entry.name));

    /**
     * Returns one exact static Operation entry.
     *
     * @param {string} name - Exact Operation name.
     * @returns {Object|null} Immutable catalog entry or null.
     */
    function getOperation(name) {
        return entriesByName.get(name) ?? null;
    }

    /**
     * Returns all exact Operation names in generated configuration order.
     *
     * @returns {string[]} Immutable Operation name list.
     */
    function getOperationNames() {
        return names;
    }

    /**
     * Searches fixed names and sanitized descriptions with stable pagination.
     *
     * @param {string} query - Non-empty catalog query.
     * @param {number} [limit=5] - Maximum results in this page.
     * @param {number} [offset=0] - Zero-based result offset.
     * @returns {Object} Search page and pagination state.
     */
    function searchOperations(query, limit=OPERATION_SEARCH_DEFAULT_LIMIT, offset=0) {
        if (typeof query !== "string" || query.trim().length === 0 ||
            [...query].length > OPERATION_SEARCH_MAX_QUERY_CODE_POINTS) {
            throw new RangeError("Operation query is outside the supported range");
        }
        if (!Number.isInteger(limit) || limit < 1 || limit > OPERATION_SEARCH_MAX_LIMIT) {
            throw new RangeError("Operation search limit is outside the supported range");
        }
        if (!Number.isInteger(offset) || offset < 0) {
            throw new RangeError("Operation search offset must be a non-negative integer");
        }

        const nameMatches = [],
            descriptionMatches = [],
            nameQuery = query.replace(/\s/gu, ""),
            descriptionQuery = query.toLowerCase();

        for (const [sourceIndex, entry] of entries.entries()) {
            const [nameMatch, score] = fuzzyMatch(nameQuery, entry.name),
                descriptionMatch = entry.description.toLowerCase().includes(descriptionQuery);

            if (nameMatch) {
                nameMatches.push({entry, score, sourceIndex});
            } else if (descriptionMatch) {
                descriptionMatches.push(entry);
            }
        }

        // Match the visible Operation search while making equal scores deterministic.
        nameMatches.sort((left, right) => right.score - left.score ||
            left.sourceIndex - right.sourceIndex);

        const matches = nameMatches.map(match => match.entry).concat(descriptionMatches),
            pageEntries = matches.slice(offset, offset + limit),
            nextOffset = offset + pageEntries.length < matches.length ? offset + pageEntries.length : null;

        return Object.freeze({
            items: Object.freeze(pageEntries),
            total: matches.length,
            offset,
            limit,
            nextOffset,
        });
    }

    return Object.freeze({
        size: entries.length,
        getOperation,
        getOperationNames,
        searchOperations,
    });
}

const OPERATION_CATALOG = createOperationCatalog();

export {
    OPERATION_CATALOG,
    OPERATION_DESCRIPTION_MAX_CODE_POINTS,
    OPERATION_SEARCH_DEFAULT_LIMIT,
    OPERATION_SEARCH_MAX_LIMIT,
    OPERATION_SEARCH_MAX_QUERY_CODE_POINTS,
    createOperationCatalog,
    sanitizeOperationDescription,
};
