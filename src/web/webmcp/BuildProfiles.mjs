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
        authorizationText: "Allows an Agent to read bounded Recipe structure and apply visible Recipe changes. Tool results contain catalog metadata, Recipe structure, and mutation status.",
    },
    [PROFILE_NAME.RUN]: {
        name: PROFILE_NAME.RUN,
        toolNames: FORMAL_TOOL_NAMES.slice(0, 5),
        stateFields: RUN_STATE_FIELDS,
        authorizationText: "Allows an Agent to change and run the visible Recipe. Tool results contain catalog metadata, Recipe structure, mutation status, and run status.",
    },
    [PROFILE_NAME.ANALYSIS]: {
        name: PROFILE_NAME.ANALYSIS,
        toolNames: FORMAL_TOOL_NAMES,
        stateFields: ANALYSIS_STATE_FIELDS,
        authorizationText: "Allows an Agent to change and run the visible Recipe and receive bounded Output-derived signals. Tool results contain catalog metadata, Recipe structure, mutation status, run status, and derived analysis.",
    },
};

for (const profile of Object.values(BUILD_PROFILES)) {
    Object.freeze(profile.toolNames);
    Object.freeze(profile.stateFields);
    Object.freeze(profile);
}
Object.freeze(BUILD_PROFILES);

const ACTIVE_BUILD_PROFILE = BUILD_PROFILES[PROFILE_NAME.READINESS];

export {
    ACTIVE_BUILD_PROFILE,
    BUILD_PROFILES,
    PROFILE_NAME,
};
