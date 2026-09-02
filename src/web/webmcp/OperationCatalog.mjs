import OperationConfig from "../../core/config/OperationConfig.json" with { type: "json" };
import { fuzzyMatch } from "../../core/lib/FuzzyMatch.mjs";
import {
    OPERATION_ACCESS,
    OPERATION_ACCESS_AUDIT,
} from "./OperationAccessAudit.mjs";
import {resolveOperationArguments} from "./OperationArguments.mjs";
import {
    OPERATION_DESCRIPTION_MAX_CODE_POINTS,
    sanitizeOperationDescription,
} from "./CatalogText.mjs";
import { describeOperationIngredients } from "./OperationIngredients.mjs";

const OPERATION_SEARCH_DEFAULT_LIMIT = 5;
const OPERATION_SEARCH_MAX_LIMIT = 10;
const OPERATION_SEARCH_MAX_QUERY_CODE_POINTS = 128;


/**
 * Creates an immutable static Operation catalog with stable search behavior.
 *
 * @param {Object} config - Generated Operation configuration keyed by exact name.
 * @param {Function} [includeOperation] - Optional exact-name inclusion policy.
 * @returns {Object} Catalog lookup and search interface.
 */
function createOperationCatalog(config=OperationConfig, includeOperation=() => true) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new TypeError("Operation configuration must be an object");
    }
    if (typeof includeOperation !== "function") {
        throw new TypeError("Operation inclusion policy must be a function");
    }

    const configEntries = Object.entries(config).filter(([name]) => includeOperation(name)),
        entries = configEntries.map(([name, operation]) => Object.freeze({
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
        ingredientsByName = new Map(configEntries.map(([name, operation]) => [
            name,
            Array.isArray(operation?.args) ? operation.args : [],
        ])),
        defaultArgumentsByName = new Map(configEntries.map(([name]) => {
            const result = config === OperationConfig ? resolveOperationArguments(name) : null;
            return [name, result?.valid ? result.arguments : null];
        })),
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
     * Returns bounded static Ingredient descriptors for one exact Operation.
     *
     * @param {string} name - Exact Operation name.
     * @param {number} [optionOffset=0] - Zero-based static option offset.
     * @param {number} [optionLimit=20] - Maximum options in this page.
     * @returns {Object|null} Ingredient description page or null.
     */
    function getOperationIngredients(name, optionOffset, optionLimit) {
        const ingredients = ingredientsByName.get(name);
        if (!ingredients) return null;
        return describeOperationIngredients(
            ingredients,
            optionOffset,
            optionLimit,
            defaultArgumentsByName.get(name)
        );
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
        getOperationIngredients,
        getOperationNames,
        searchOperations,
    });
}

const OPERATION_CATALOG = createOperationCatalog(OperationConfig, operationName =>
    OPERATION_ACCESS_AUDIT.getOperationAccess(operationName) !== OPERATION_ACCESS.EXCLUDED
);

export {
    OPERATION_CATALOG,
    OPERATION_DESCRIPTION_MAX_CODE_POINTS,
    OPERATION_SEARCH_DEFAULT_LIMIT,
    OPERATION_SEARCH_MAX_LIMIT,
    OPERATION_SEARCH_MAX_QUERY_CODE_POINTS,
    createOperationCatalog,
    sanitizeOperationDescription,
};
