import {
    READINESS_TOOL_NAME,
    TOOL_NAME,
} from "./ToolDefinitions.mjs";

const PROFILE_NAME = Object.freeze({
    READINESS: "readiness",
    RECIPE: "recipe",
    RUN: "run",
    ANALYSIS: "analysis",
});

const RECIPE_TOOL_NAMES = Object.freeze([
    TOOL_NAME.SEARCH_OPERATIONS,
    TOOL_NAME.GET_OPERATION_DETAILS,
    TOOL_NAME.GET_RECIPE_STATE,
    TOOL_NAME.APPLY_RECIPE_PATCH,
]);

const RUN_TOOL_NAMES = Object.freeze([
    ...RECIPE_TOOL_NAMES,
    TOOL_NAME.BAKE_RECIPE,
]);

const ANALYSIS_TOOL_NAMES = Object.freeze([
    ...RUN_TOOL_NAMES,
    TOOL_NAME.INSPECT_OUTPUT,
]);

const RECIPE_STATE_FIELDS = Object.freeze([
    "sessionEpoch",
    "recipeRevision",
    "executionCapability",
]);

const RUN_STATE_FIELDS = Object.freeze([
    ...RECIPE_STATE_FIELDS,
    "inputTabId",
    "inputGeneration",
    "inputRevision",
    "executionOptionsVersion",
    "viewVersion",
    "outputTabId",
    "outputGeneration",
    "outputVersion",
    "bakeId",
    "terminalState",
]);

const ANALYSIS_STATE_FIELDS = Object.freeze([
    ...RUN_STATE_FIELDS,
    "analysisId",
]);

const BUILD_PROFILES = {
    [PROFILE_NAME.READINESS]: {
        name: PROFILE_NAME.READINESS,
        toolNames: [READINESS_TOOL_NAME],
        stateFields: [],
        authorizationText: "Exposes the fixed WebMCP invocation status for this CyberChef page.",
    },
    [PROFILE_NAME.RECIPE]: {
        name: PROFILE_NAME.RECIPE,
        toolNames: RECIPE_TOOL_NAMES,
        stateFields: RECIPE_STATE_FIELDS,
        authorizationText: "Allows WebMCP tools to search Operations, read redacted Recipe structure, and apply visible Recipe changes. WebMCP changes do not run automatically; the user runs Bake to check results.",
    },
    [PROFILE_NAME.RUN]: {
        name: PROFILE_NAME.RUN,
        toolNames: RUN_TOOL_NAMES,
        stateFields: RUN_STATE_FIELDS,
        authorizationText: "Allows WebMCP tools to search Operations, read and change redacted Recipe structure, and request a run for the active Input. The visible Output remains available for user review.",
    },
    [PROFILE_NAME.ANALYSIS]: {
        name: PROFILE_NAME.ANALYSIS,
        toolNames: ANALYSIS_TOOL_NAMES,
        stateFields: ANALYSIS_STATE_FIELDS,
        authorizationText: "Allows WebMCP tools to search Operations, read and change redacted Recipe structure, request a run for the active Input, and receive bounded Output-derived analysis. The visible Output remains available for user review.",
    },
};

for (const profile of Object.values(BUILD_PROFILES)) {
    Object.freeze(profile.toolNames);
    Object.freeze(profile.stateFields);
    Object.freeze(profile);
}
Object.freeze(BUILD_PROFILES);

const ACTIVE_BUILD_PROFILE = BUILD_PROFILES[PROFILE_NAME.ANALYSIS];

export {
    ACTIVE_BUILD_PROFILE,
    BUILD_PROFILES,
    PROFILE_NAME,
};
