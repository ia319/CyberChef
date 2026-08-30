import {
    FORMAL_TOOL_NAMES,
    READINESS_TOOL_NAME,
} from "./ToolDefinitions.mjs";

const PROFILE_NAME = Object.freeze({
    READINESS: "readiness",
    RECIPE: "recipe",
    RUN: "run",
    ANALYSIS: "analysis",
});

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
        toolNames: FORMAL_TOOL_NAMES.slice(0, 4),
        stateFields: RECIPE_STATE_FIELDS,
        authorizationText: "Allows WebMCP tools to search Operations, read redacted Recipe structure, and apply visible Recipe changes. WebMCP changes do not run automatically; the user runs Bake to check results.",
    },
    [PROFILE_NAME.RUN]: {
        name: PROFILE_NAME.RUN,
        toolNames: FORMAL_TOOL_NAMES.slice(0, 5),
        stateFields: RUN_STATE_FIELDS,
        authorizationText: "Allows WebMCP tools to search Operations, read and change redacted Recipe structure, and request a run for the active Input. The visible Output remains available for user review.",
    },
    [PROFILE_NAME.ANALYSIS]: {
        name: PROFILE_NAME.ANALYSIS,
        toolNames: FORMAL_TOOL_NAMES,
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

const ACTIVE_BUILD_PROFILE = BUILD_PROFILES[PROFILE_NAME.RECIPE];

export {
    ACTIVE_BUILD_PROFILE,
    BUILD_PROFILES,
    PROFILE_NAME,
};
