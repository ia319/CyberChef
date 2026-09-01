import OperationConfig from "../../core/config/OperationConfig.json" with {type: "json"};
import {enumRule} from "./OperationProfileRules.mjs";
import {linearResourceLimits} from "./OperationResourcePolicy.mjs";

const REVIEWED_CODE_PAGE_IDS = new Set([
    37, 437, 500, 620, 708, 720, 737, 775, 808, 850, 852, 855, 857, 858, 860,
    861, 862, 863, 864, 865, 866, 869, 870, 872, 874, 875, 895, 932, 936, 949,
    950, 1010, 1026, 1047, 1132, 1140, 1141, 1142, 1143, 1144, 1145, 1146,
    1147, 1148, 1149, 1200, 1201, 1250, 1251, 1252, 1253, 1254, 1255, 1256,
    1257, 1258, 1361, 10000, 10001, 10002, 10003, 10004, 10005, 10006, 10007,
    10008, 10010, 10017, 10021, 10029, 10079, 10081, 10082, 12000, 12001,
    20000, 20001, 20002, 20003, 20004, 20005, 20105, 20106, 20107, 20108,
    20127, 20261, 20269, 20273, 20277, 20278, 20280, 20284, 20285, 20290,
    20297, 20420, 20423, 20424, 20833, 20838, 20866, 20871, 20880, 20905,
    20924, 20932, 20936, 20949, 21025, 21027, 21866, 28591, 28592, 28593,
    28594, 28595, 28596, 28597, 28598, 28599, 28600, 28601, 28603, 28604,
    28605, 28606, 29001, 38598, 47451, 51932, 51936, 51949, 52936, 54936,
    57002, 57003, 57004, 57005, 57006, 57007, 57008, 57009, 57010, 57011,
    65000, 65001,
]);


/**
 * Returns the generated labels for the reviewed code page identifiers.
 *
 * @returns {string[]} Reviewed current Operation argument values.
 */
function getReviewedCharacterEncodings() {
    const options = OperationConfig["Encode text"]?.args?.[0]?.value;
    if (!Array.isArray(options)) return [];
    return options.filter(option => {
        if (typeof option !== "string") return false;
        const match = option.match(/\((\d+)(?:\/\d+)*\)$/u);
        return match && REVIEWED_CODE_PAGE_IDS.has(Number(match[1]));
    });
}

const CHARACTER_ENCODINGS = Object.freeze(getReviewedCharacterEncodings());
const CHARACTER_ENCODING_RULE = enumRule(CHARACTER_ENCODINGS);

const CHARACTER_ENCODING_OPERATION_PROFILE_CONFIGS = Object.freeze([
    Object.freeze({
        operationName: "Encode text",
        argumentRules: Object.freeze([CHARACTER_ENCODING_RULE]),
        defaultArguments: Object.freeze(["UTF-8 (65001)"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(8),
        evidence: Object.freeze([
            "src/core/operations/EncodeText.mjs",
            "src/core/lib/ChrEnc.mjs",
            "package-lock.json",
            "tests/operations/tests/CharEnc.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
    Object.freeze({
        operationName: "Decode text",
        argumentRules: Object.freeze([CHARACTER_ENCODING_RULE]),
        defaultArguments: Object.freeze(["UTF-8 (65001)"]),
        argumentRelations: Object.freeze([]),
        sensitiveArgumentIndexes: Object.freeze([]),
        resourceLimits: linearResourceLimits(8),
        evidence: Object.freeze([
            "src/core/operations/DecodeText.mjs",
            "src/core/lib/ChrEnc.mjs",
            "package-lock.json",
            "tests/operations/tests/CharEnc.mjs",
        ]),
        reviewedOn: "2026-09-02",
    }),
]);

export {
    CHARACTER_ENCODINGS,
    CHARACTER_ENCODING_OPERATION_PROFILE_CONFIGS,
};
