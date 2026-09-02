import assert from "assert";
import {ANALYSIS_STATE} from "../../../src/web/analysis/AnalysisCoordinator.mjs";
import {
    MAX_ANALYSIS_OPERATION_NAMES,
    UNKNOWN_ANALYSIS_ID,
    getDetectedTypeId,
    getEntropyBand,
    getTopLanguageId,
    serializeOutputAnalysis,
} from "../../../src/web/webmcp/OutputAnalysisSerializer.mjs";
import {createSuccessResult} from "../../../src/web/webmcp/ToolResult.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


const ANALYSIS = Object.freeze({
    analysisId: 7,
    terminalState: ANALYSIS_STATE.SIGNALS_READY,
    target: Object.freeze({
        bakeId: 4,
        recipeRevision: 3,
        inputTabId: 1,
        inputGeneration: "1:1",
        inputRevision: 2,
        outputTabId: 1,
        outputGeneration: 5,
        outputVersion: 6,
        executionOptionsVersion: 8,
        terminalState: "completed",
    }),
});


TestRegister.addApiTests([
    it("WebMCPOutputAnalysisSerializer: should project only approved coarse fields", () => {
        const result = serializeOutputAnalysis(ANALYSIS, [{
                data: "OUTPUT_PREVIEW_CANARY",
                recipe: [
                    {op: "From Base64", args: ["ARGUMENT_CANARY", true, false]},
                    {op: "To Hex", args: ["Space", 0]},
                    {op: "ROT13", args: [true, true, false, 13]},
                    {op: "URL Decode", args: [true]},
                ],
                languageScores: [{
                    lang: "en",
                    probability: 0.987654321,
                    score: 12.3456789,
                }],
                fileType: {
                    name: "PNG_CANARY",
                    ext: "png",
                    mime: "image/png",
                    desc: "FILE_DESCRIPTION_CANARY",
                },
                isUTF8: true,
                entropy: 4.123456789,
                matchingOps: [
                    {op: "From Hex", args: ["MATCH_ARGUMENT_CANARY"]},
                    {op: "From Base64", args: []},
                    {op: "From Hex", args: []},
                    {op: "URL Decode", args: []},
                    {op: "To Base64", args: []},
                ],
                matchesCrib: true,
                useful: true,
            }], [{
                candidateId: "analysis-candidate-1",
                rank: 1,
                operationNames: ["From Base64", "To Hex", "ROT13"],
            }]),
            serialized = JSON.stringify(createSuccessResult(result));

        assert.deepStrictEqual(Object.keys(result), [
            "analysisId",
            "analysisState",
            "bakeId",
            "recipeRevision",
            "inputTabId",
            "inputGeneration",
            "inputRevision",
            "executionOptionsVersion",
            "outputTabId",
            "outputGeneration",
            "outputVersion",
            "isUtf8",
            "detectedTypeId",
            "entropyBand",
            "topLanguageId",
            "matchingOperationNames",
            "candidateOperationNames",
            "candidates",
        ]);
        assert.deepStrictEqual(result, {
            analysisId: 7,
            analysisState: "signalsReady",
            bakeId: 4,
            recipeRevision: 3,
            inputTabId: 1,
            inputGeneration: "1:1",
            inputRevision: 2,
            executionOptionsVersion: 8,
            outputTabId: 1,
            outputGeneration: 5,
            outputVersion: 6,
            isUtf8: true,
            detectedTypeId: "image",
            entropyBand: "medium",
            topLanguageId: "en",
            matchingOperationNames: ["From Hex", "From Base64", "URL Decode"],
            candidateOperationNames: ["From Base64", "To Hex", "ROT13"],
            candidates: [{
                candidateId: "analysis-candidate-1",
                rank: 1,
                operationNames: ["From Base64", "To Hex", "ROT13"],
            }],
        });
        for (const canary of [
            "OUTPUT_PREVIEW_CANARY",
            "ARGUMENT_CANARY",
            "MATCH_ARGUMENT_CANARY",
            "PNG_CANARY",
            "FILE_DESCRIPTION_CANARY",
            "0.987654321",
            "12.3456789",
            "4.123456789",
        ]) assert.equal(serialized.includes(canary), false);
    }),

    it("WebMCPOutputAnalysisSerializer: should replace unknown derived identifiers", () => {
        const canary = "PROMPT_INJECTION_CANARY",
            result = serializeOutputAnalysis(ANALYSIS, [{
                recipe: [{op: canary, args: [canary]}],
                languageScores: [{lang: canary, probability: 1}],
                fileType: {mime: `application/${canary}`},
                isUTF8: canary,
                entropy: canary,
                matchingOps: [{op: canary}],
                data: canary,
            }]),
            serialized = JSON.stringify(result);

        assert.equal(result.isUtf8, false);
        assert.equal(result.detectedTypeId, UNKNOWN_ANALYSIS_ID);
        assert.equal(result.entropyBand, UNKNOWN_ANALYSIS_ID);
        assert.equal(result.topLanguageId, UNKNOWN_ANALYSIS_ID);
        assert.deepStrictEqual(result.matchingOperationNames, []);
        assert.deepStrictEqual(result.candidateOperationNames, []);
        assert.deepStrictEqual(result.candidates, []);
        assert.equal(serialized.includes(canary), false);
    }),

    it("WebMCPOutputAnalysisSerializer: should apply fixed entropy boundaries", () => {
        const cases = [
            [-1, "unknown"],
            [0, "low"],
            [2.999, "low"],
            [3, "medium"],
            [4.999, "medium"],
            [5, "high"],
            [8, "high"],
            [8.001, "unknown"],
            [Number.NaN, "unknown"],
            [Number.POSITIVE_INFINITY, "unknown"],
        ];
        for (const [value, expected] of cases) assert.equal(getEntropyBand(value), expected);
    }),

    it("WebMCPOutputAnalysisSerializer: should use fixed type and language identifiers", () => {
        assert.equal(getDetectedTypeId({mime: "application/pdf"}), "document");
        assert.equal(getDetectedTypeId({mime: "application/zip"}), "archive");
        assert.equal(getDetectedTypeId({mime: "application/x-executable"}), "executable");
        assert.equal(getDetectedTypeId({mime: "application/octet-stream"}), "unknown");
        assert.equal(getTopLanguageId([{lang: "zh", probability: 0.5}]), "zh");
        assert.equal(getTopLanguageId([{lang: "en", probability: 0}]), "unknown");
        assert.equal(getTopLanguageId([{lang: "ace", probability: 0.5}]), "unknown");
    }),

    it("WebMCPOutputAnalysisSerializer: should reject incomplete analysis records", () => {
        assert.throws(() => serializeOutputAnalysis(null, []), TypeError);
        assert.throws(() => serializeOutputAnalysis({
            ...ANALYSIS,
            terminalState: ANALYSIS_STATE.NO_SUGGESTION,
        }, [{}]), TypeError);
        assert.throws(() => serializeOutputAnalysis({
            ...ANALYSIS,
            target: {...ANALYSIS.target, inputGeneration: "IDENTITY_CANARY"},
        }, [{}]), TypeError);
        assert.throws(() => serializeOutputAnalysis(ANALYSIS, []), TypeError);
        assert.equal(MAX_ANALYSIS_OPERATION_NAMES, 3);
    }),
]);
