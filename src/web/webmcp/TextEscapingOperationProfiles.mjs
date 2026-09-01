import {
    booleanRule,
    enumRule,
    integerRule,
} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const UNICODE_ESCAPE_PREFIXES = Object.freeze(["\\u", "%u", "U+"]);
const HTML_ENTITY_FORMATS = Object.freeze([
    "Named entities",
    "Numeric entities",
    "Hex entities",
]);

const TEXT_ESCAPING_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "Escape Unicode Characters",
        argumentRules: Object.freeze([
            enumRule(UNICODE_ESCAPE_PREFIXES),
            booleanRule(),
            integerRule(0, 8),
            booleanRule(),
        ]),
        defaultArguments: Object.freeze(["\\u", false, 4, true]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(10),
        evidence: Object.freeze([
            "src/core/operations/EscapeUnicodeCharacters.mjs",
            "tests/operations/tests/TextIntegerConverter.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "Unescape Unicode Characters",
        argumentRules: Object.freeze([enumRule(UNICODE_ESCAPE_PREFIXES)]),
        defaultArguments: Object.freeze(["\\u"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/UnescapeUnicodeCharacters.mjs",
            "tests/operations/tests/UnescapeUnicodeCharacters.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "To HTML Entity",
        argumentRules: Object.freeze([
            booleanRule(),
            enumRule(HTML_ENTITY_FORMATS),
        ]),
        defaultArguments: Object.freeze([false, "Named entities"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(10),
        evidence: Object.freeze([
            "src/core/operations/ToHTMLEntity.mjs",
            "src/core/lib/HTMLEntities.mjs",
            "tests/operations/tests/HTMLEntity.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "From HTML Entity",
        argumentRules: Object.freeze([]),
        defaultArguments: Object.freeze([]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(1),
        evidence: Object.freeze([
            "src/core/operations/FromHTMLEntity.mjs",
            "src/core/lib/HTMLEntities.mjs",
            "tests/operations/tests/HTMLEntity.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    HTML_ENTITY_FORMATS,
    TEXT_ESCAPING_OPERATION_PROFILE_CONFIGS,
    UNICODE_ESCAPE_PREFIXES,
};
