import {
    MAX_MAGIC_ANALYSIS_CRIB_LENGTH,
    MAX_MAGIC_ANALYSIS_DEPTH,
} from "../analysis/AnalysisPolicy.mjs";
import {ANALYSIS_CANDIDATE_ID_PATTERN} from "./AnalysisCandidateStore.mjs";


const TOOL_NAME = Object.freeze({
    SEARCH_OPERATIONS: "search_operations",
    GET_OPERATION_DETAILS: "get_operation_details",
    GET_RECIPE_STATE: "get_recipe_state",
    APPLY_RECIPE_PATCH: "apply_recipe_patch",
    BAKE_RECIPE: "bake_recipe",
    INSPECT_OUTPUT: "inspect_output",
});

const READINESS_TOOL_NAME = "cyberchef_webmcp_probe";

const READ_ONLY_ANNOTATIONS = Object.freeze({
    readOnlyHint: true,
    untrustedContentHint: false,
});

const UNTRUSTED_READ_ONLY_ANNOTATIONS = Object.freeze({
    readOnlyHint: true,
    untrustedContentHint: true,
});

const STATE_CHANGING_ANNOTATIONS = Object.freeze({
    readOnlyHint: false,
    untrustedContentHint: false,
});

const UNTRUSTED_STATE_CHANGING_ANNOTATIONS = Object.freeze({
    readOnlyHint: false,
    untrustedContentHint: true,
});

const READINESS_TOOL_CONTRACT = {
    title: "Check CyberChef WebMCP Readiness",
    description: "Reports the fixed WebMCP invocation status for this CyberChef page.",
    inputSchema: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
    requiresSession: false,
};

const OPERATION_NAME_SCHEMA = {
    type: "string",
    minLength: 1,
    maxLength: 128,
    description: "Exact name from the CyberChef Operation catalog.",
};

const STEP_ID_SCHEMA = {
    type: "string",
    minLength: 1,
    maxLength: 64,
    description: "Stable identifier of one Recipe step.",
};

const REVISION_SCHEMA = {
    type: "integer",
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER,
    description: "Recipe revision previously returned by CyberChef.",
};

const APPROVAL_REQUEST_ID_SCHEMA = {
    type: "string",
    pattern: "^[A-Za-z0-9_-]{16,128}$",
    description: "Opaque request identifier issued by CyberChef for the exact approved action.",
};

const ANALYSIS_CANDIDATE_ID_SCHEMA = {
    type: "string",
    pattern: ANALYSIS_CANDIDATE_ID_PATTERN.source,
    description: "Opaque reference to one exact Magic candidate returned by CyberChef.",
};

/**
 * Creates an object schema that rejects undeclared properties.
 *
 * @param {Object} properties - Supported properties.
 * @param {string[]} required - Required property names.
 * @returns {Object} A closed object schema.
 */
function closedObject(properties, required) {
    return {
        type: "object",
        properties,
        required,
        additionalProperties: false,
    };
}

const TOGGLE_STRING_ARGUMENT_SCHEMA = closedObject({
    option: {type: "string"},
    string: {type: "string"},
}, ["option", "string"]);

const ARGUMENT_VALUE_SCHEMA = {
    anyOf: [
        {type: "string"},
        {type: "number"},
        {type: "boolean"},
        TOGGLE_STRING_ARGUMENT_SCHEMA,
    ],
};

const INSERT_PROPERTIES = {
    type: {type: "string", const: "insert"},
    operation: OPERATION_NAME_SCHEMA,
    arguments: {
        type: "array",
        items: ARGUMENT_VALUE_SCHEMA,
        description: "Argument values for the inserted Operation.",
    },
};

const INSERT_COMMAND_SCHEMA = {
    oneOf: [
        closedObject(INSERT_PROPERTIES, ["type", "operation"]),
        closedObject({...INSERT_PROPERTIES, beforeStepId: STEP_ID_SCHEMA}, ["type", "operation", "beforeStepId"]),
        closedObject({...INSERT_PROPERTIES, afterStepId: STEP_ID_SCHEMA}, ["type", "operation", "afterStepId"]),
    ],
};

const REMOVE_COMMAND_SCHEMA = closedObject({
    type: {type: "string", const: "remove"},
    stepId: STEP_ID_SCHEMA,
}, ["type", "stepId"]);

const MOVE_COMMAND_SCHEMA = {
    oneOf: [
        closedObject({
            type: {type: "string", const: "move"},
            stepId: STEP_ID_SCHEMA,
            beforeStepId: STEP_ID_SCHEMA,
        }, ["type", "stepId", "beforeStepId"]),
        closedObject({
            type: {type: "string", const: "move"},
            stepId: STEP_ID_SCHEMA,
            afterStepId: STEP_ID_SCHEMA,
        }, ["type", "stepId", "afterStepId"]),
    ],
};

const ENABLE_COMMAND_SCHEMA = closedObject({
    type: {type: "string", const: "enable"},
    stepId: STEP_ID_SCHEMA,
}, ["type", "stepId"]);

const DISABLE_COMMAND_SCHEMA = closedObject({
    type: {type: "string", const: "disable"},
    stepId: STEP_ID_SCHEMA,
}, ["type", "stepId"]);

const BREAKPOINT_COMMAND_SCHEMA = closedObject({
    type: {type: "string", const: "setBreakpoint"},
    stepId: STEP_ID_SCHEMA,
    enabled: {type: "boolean"},
}, ["type", "stepId", "enabled"]);

const ARGUMENT_COMMAND_SCHEMA = closedObject({
    type: {type: "string", const: "setArgument"},
    stepId: STEP_ID_SCHEMA,
    argumentIndex: {
        type: "integer",
        minimum: 0,
        description: "Zero-based Operation argument position.",
    },
    value: ARGUMENT_VALUE_SCHEMA,
}, ["type", "stepId", "argumentIndex", "value"]);

const SEARCH_OPERATIONS_SCHEMA = closedObject({
    query: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        description: "Catalog query for fixed Operation names and descriptions.",
    },
    limit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "Maximum number of matching Operations to return.",
    },
    offset: {
        type: "integer",
        minimum: 0,
        maximum: 10000,
        description: "Zero-based result offset for stable pagination.",
    },
}, ["query"]);

const GET_OPERATION_DETAILS_SCHEMA = closedObject({
    name: OPERATION_NAME_SCHEMA,
    argumentOffset: {
        type: "integer",
        minimum: 0,
        maximum: 10000,
        description: "Zero-based offset into the Operation argument list.",
    },
    argumentLimit: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "Maximum number of Operation arguments to return.",
    },
    optionOffset: {
        type: "integer",
        minimum: 0,
        maximum: 10000,
        description: "Zero-based offset into a large fixed option list.",
    },
    optionLimit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        description: "Maximum number of fixed options to return.",
    },
}, ["name"]);

const GET_RECIPE_STATE_SCHEMA = closedObject({
    expectedRevision: REVISION_SCHEMA,
    offset: {
        type: "integer",
        minimum: 0,
        maximum: 199,
        description: "Zero-based Recipe step offset.",
    },
    limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        description: "Maximum number of Recipe steps to return.",
    },
}, []);

const APPLY_RECIPE_PATCH_PROPERTIES = {
    expectedRevision: REVISION_SCHEMA,
    recipeApprovalRequestId: APPROVAL_REQUEST_ID_SCHEMA,
};

const APPLY_RECIPE_CHANGES_SCHEMA = {
    type: "array",
    minItems: 1,
    description: "Ordered atomic changes to apply to the visible Recipe.",
    items: {
        oneOf: [
            INSERT_COMMAND_SCHEMA,
            REMOVE_COMMAND_SCHEMA,
            MOVE_COMMAND_SCHEMA,
            ENABLE_COMMAND_SCHEMA,
            DISABLE_COMMAND_SCHEMA,
            BREAKPOINT_COMMAND_SCHEMA,
            ARGUMENT_COMMAND_SCHEMA,
        ],
    },
};

const APPLY_RECIPE_PATCH_SCHEMA = {
    oneOf: [
        closedObject({
            ...APPLY_RECIPE_PATCH_PROPERTIES,
            changes: APPLY_RECIPE_CHANGES_SCHEMA,
        }, ["expectedRevision", "changes"]),
        closedObject({
            ...APPLY_RECIPE_PATCH_PROPERTIES,
            analysisCandidateId: ANALYSIS_CANDIDATE_ID_SCHEMA,
        }, ["expectedRevision", "analysisCandidateId"]),
    ],
};

const BAKE_RECIPE_SCHEMA = closedObject({
    expectedRevision: REVISION_SCHEMA,
    bakeApprovalRequestId: APPROVAL_REQUEST_ID_SCHEMA,
}, ["expectedRevision"]);

const INSPECT_OUTPUT_SCHEMA = closedObject({
    bakeId: {
        type: "integer",
        minimum: 1,
        maximum: Number.MAX_SAFE_INTEGER,
        description: "Completed Recipe run identifier returned by CyberChef.",
    },
    depth: {
        type: "integer",
        minimum: 0,
        maximum: MAX_MAGIC_ANALYSIS_DEPTH,
        description: "Maximum recursive Magic analysis depth. Defaults to 3.",
    },
    intensiveMode: {
        type: "boolean",
        description: "Enables bounded XOR, bit rotation, and character encoding analysis.",
    },
    extensiveLanguageSupport: {
        type: "boolean",
        description: "Enables comparison against the extended Magic language set.",
    },
    crib: {
        type: "string",
        maxLength: MAX_MAGIC_ANALYSIS_CRIB_LENGTH,
        description: "Case-insensitive regular expression that retains matching Magic candidates.",
    },
}, ["bakeId"]);

const TOOL_CONTRACTS = {
    [TOOL_NAME.SEARCH_OPERATIONS]: {
        title: "Search CyberChef Operations",
        description: "Finds fixed CyberChef Operations that match a catalog query and returns bounded, sanitized catalog metadata with capability status.",
        inputSchema: SEARCH_OPERATIONS_SCHEMA,
        annotations: UNTRUSTED_READ_ONLY_ANNOTATIONS,
        requiresSession: false,
    },
    [TOOL_NAME.GET_OPERATION_DETAILS]: {
        title: "Get CyberChef Operation Details",
        description: "Returns bounded, sanitized catalog metadata, defaults, constraints, and capability status for one exact CyberChef Operation.",
        inputSchema: GET_OPERATION_DETAILS_SCHEMA,
        annotations: UNTRUSTED_READ_ONLY_ANNOTATIONS,
        requiresSession: false,
    },
    [TOOL_NAME.GET_RECIPE_STATE]: {
        title: "Read CyberChef Recipe State",
        description: "Returns the authorized visible Recipe revision and bounded step structure, including Operation names, order, enabled state, and breakpoints.",
        inputSchema: GET_RECIPE_STATE_SCHEMA,
        annotations: UNTRUSTED_READ_ONLY_ANNOTATIONS,
        requiresSession: true,
    },
    [TOOL_NAME.APPLY_RECIPE_PATCH]: {
        title: "Change the CyberChef Recipe",
        description: "Applies ordered supported changes or one page-issued Magic candidate atomically to the visible Recipe at the expected revision.",
        inputSchema: APPLY_RECIPE_PATCH_SCHEMA,
        annotations: STATE_CHANGING_ANNOTATIONS,
        requiresSession: true,
    },
    [TOOL_NAME.BAKE_RECIPE]: {
        title: "Run the CyberChef Recipe",
        description: "Runs the authorized active Input with the exact visible Recipe revision, consumes local compute resources, and updates the visible Output.",
        inputSchema: BAKE_RECIPE_SCHEMA,
        annotations: STATE_CHANGING_ANNOTATIONS,
        requiresSession: true,
    },
    [TOOL_NAME.INSPECT_OUTPUT]: {
        title: "Inspect CyberChef Output",
        description: "Analyzes the current authorized Output locally with bounded Magic options, consumes a session analysis slot when new work starts, and returns sanitized user-derived signals with ranked Magic candidate references; matching Operation names remain separate format checks.",
        inputSchema: INSPECT_OUTPUT_SCHEMA,
        annotations: UNTRUSTED_STATE_CHANGING_ANNOTATIONS,
        requiresSession: true,
    },
};

const FORMAL_TOOL_NAMES = Object.freeze(Object.values(TOOL_NAME));

/**
 * Prevents runtime state from changing discovery contracts.
 *
 * @param {*} value - Definition value to freeze.
 * @returns {*} The frozen value.
 */
function freezeDefinition(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) freezeDefinition(child);
    return Object.freeze(value);
}

freezeDefinition(READINESS_TOOL_CONTRACT);
freezeDefinition(TOOL_CONTRACTS);

export {
    FORMAL_TOOL_NAMES,
    READINESS_TOOL_CONTRACT,
    READINESS_TOOL_NAME,
    TOOL_CONTRACTS,
    TOOL_NAME,
};
