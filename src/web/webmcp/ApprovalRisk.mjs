const APPROVAL_RISK_FLAG = Object.freeze({
    SECRET_INPUT: "secretInput",
    SENSITIVE_OUTPUT: "sensitiveOutput",
    NETWORK_ACCESS: "networkAccess",
    RICH_CONTENT: "richContent",
    RESOURCE_INTENSIVE: "resourceIntensive",
    BROWSER_SIDE_EFFECT: "browserSideEffect",
    RECIPE_FLOW: "recipeFlow",
    NONDETERMINISTIC: "nondeterministic",
    INPUT_DERIVED_ARGUMENTS: "inputDerivedArguments",
});

export {
    APPROVAL_RISK_FLAG,
};
