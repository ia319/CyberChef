import {OPERATION_CATALOG} from "./OperationCatalog.mjs";
import {getOperationPermissions} from "./OperationPermissions.mjs";
import {ToolExecutionError} from "./ToolExecutor.mjs";
import {TOOL_NAME} from "./ToolDefinitions.mjs";
import {
    TOOL_ERROR_CODE,
    isSuccessResultWithinBudget,
} from "./ToolResult.mjs";

const OPERATION_ARGUMENT_DEFAULT_LIMIT = 3;


/**
 * Projects one catalog entry into the search result contract.
 *
 * @param {Object} entry - Static catalog entry.
 * @returns {Object} Sanitized discovery metadata.
 */
function createSearchItem(entry) {
    const permissions = getOperationPermissions(entry.name);
    return {
        name: entry.name,
        reviewStatus: permissions.reviewStatus,
        supportedActions: permissions.supportedMutationActions,
    };
}


/**
 * Projects one static Ingredient descriptor without workspace values.
 *
 * @param {Object} argument - Static Ingredient descriptor.
 * @returns {Object} Bounded argument metadata.
 */
function createArgumentDetails(argument) {
    return {
        index: argument.argumentIndex,
        name: argument.name,
        description: argument.description,
        valueType: argument.valueType,
        defaultAvailable: argument.defaultAvailable,
        defaultValue: argument.defaultValue,
        supportedForPatch: argument.supportedForPatch,
        unsupportedReason: argument.unsupportedReason,
        constraints: argument.constraints,
    };
}


/**
 * Projects one static option into a compact paginated result.
 *
 * @param {Object} option - Static option descriptor.
 * @returns {Object} Bounded option metadata.
 */
function createOptionDetails(option) {
    return {
        argumentIndex: option.argumentIndex,
        optionIndex: option.sourceOptionIndex,
        label: option.label,
        valueIncluded: option.valueIncluded,
        value: option.value,
    };
}


/**
 * Creates static Operation catalog handlers with a testable catalog boundary.
 *
 * @param {Object} [catalog=OPERATION_CATALOG] - Immutable Operation catalog.
 * @returns {Object} Handlers keyed by formal tool name.
 */
function createOperationToolHandlers(catalog=OPERATION_CATALOG) {
    if (!catalog || typeof catalog.searchOperations !== "function" ||
        typeof catalog.getOperation !== "function" ||
        typeof catalog.getOperationIngredients !== "function") {
        throw new TypeError("Operation tool handlers require a complete catalog");
    }

    /**
     * Searches fixed Operation metadata and preserves stable pagination within the result budget.
     *
     * @param {Object} input - Schema-validated search input.
     * @returns {Object} Handler data containing a static catalog page.
     */
    function searchOperations(input) {
        const page = catalog.searchOperations(input.query, input.limit, input.offset),
            requestedItems = page.items.map(createSearchItem);
        let itemCount = requestedItems.length,
            data;

        do {
            const items = requestedItems.slice(0, itemCount);
            data = {
                items,
                total: page.total,
                offset: page.offset,
                limit: page.limit,
                nextOffset: page.offset + items.length < page.total ?
                    page.offset + items.length : null,
            };
            if (isSuccessResultWithinBudget(data)) break;
            itemCount--;
        } while (itemCount >= 0);

        if (itemCount < 0) throw new ToolExecutionError(TOOL_ERROR_CODE.RESULT_TOO_LARGE);
        return {data};
    }

    /**
     * Returns static metadata for one exact Operation without reading the Recipe workspace.
     *
     * @param {Object} input - Schema-validated details input.
     * @returns {Object} Handler data containing paginated arguments and options.
     */
    function getOperationDetails(input) {
        const operation = catalog.getOperation(input.name);
        if (!operation) throw new ToolExecutionError(TOOL_ERROR_CODE.UNKNOWN_OPERATION);

        const argumentOffset = input.argumentOffset ?? 0,
            argumentLimit = input.argumentLimit ?? OPERATION_ARGUMENT_DEFAULT_LIMIT,
            optionOffset = input.optionOffset ?? 0,
            optionLimit = input.optionLimit,
            ingredientPage = catalog.getOperationIngredients(input.name, optionOffset, optionLimit),
            permissions = getOperationPermissions(input.name),
            requestedArguments = ingredientPage.arguments
                .slice(argumentOffset, argumentOffset + argumentLimit)
                .map(createArgumentDetails),
            requestedOptions = ingredientPage.options.map(createOptionDetails),
            base = {
                name: operation.name,
                description: operation.description,
                inputType: operation.inputType,
                outputType: operation.presentType,
                manualBake: operation.manualBake,
                flowControl: operation.flowControl,
                reviewStatus: permissions.reviewStatus,
                supportedActions: permissions.supportedMutationActions,
                agentBakeAllowed: permissions.agentBakeAllowed,
            };
        let argumentCount = requestedArguments.length,
            optionCount = requestedOptions.length,
            data;

        do {
            const argumentsPage = requestedArguments.slice(0, argumentCount),
                optionsPage = requestedOptions.slice(0, optionCount);
            data = {
                ...base,
                arguments: argumentsPage,
                argumentTotal: ingredientPage.arguments.length,
                argumentOffset,
                argumentLimit,
                nextArgumentOffset: argumentOffset + argumentsPage.length < ingredientPage.arguments.length ?
                    argumentOffset + argumentsPage.length : null,
                options: optionsPage,
                optionTotal: ingredientPage.optionTotal,
                optionOffset,
                optionLimit: ingredientPage.optionLimit,
                nextOptionOffset: optionOffset + optionsPage.length < ingredientPage.optionTotal ?
                    optionOffset + optionsPage.length : null,
            };

            if (isSuccessResultWithinBudget(data)) break;
            if (optionCount > 0) optionCount--;
            else argumentCount--;
        } while (argumentCount >= 0);

        if (argumentCount < 0) throw new ToolExecutionError(TOOL_ERROR_CODE.RESULT_TOO_LARGE);
        return {data};
    }

    return Object.freeze({
        [TOOL_NAME.SEARCH_OPERATIONS]: searchOperations,
        [TOOL_NAME.GET_OPERATION_DETAILS]: getOperationDetails,
    });
}

const OPERATION_TOOL_HANDLERS = createOperationToolHandlers();

export {
    OPERATION_ARGUMENT_DEFAULT_LIMIT,
    OPERATION_TOOL_HANDLERS,
    createOperationToolHandlers,
};
