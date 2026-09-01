import assert from "assert";
import {APPROVAL_CHANGE_TYPE, APPROVAL_RISK_FLAG} from
    "../../../src/web/webmcp/ApprovalCoordinator.mjs";
import {formatApprovalSummary} from "../../../src/web/waiters/ApprovalWaiter.mjs";
import {formatAgentChangeSummary} from "../../../src/web/waiters/CollaborationWaiter.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPCollaborationUI: should format bounded action summaries without values", () => {
        const summary = formatAgentChangeSummary([
            {type: "insert", operationName: "To Base64", value: "SECRET_CANARY"},
            {type: "setArgument", operationName: "To Base64", value: "SECRET_CANARY"},
            {type: "move", operationName: "From Hex", value: "SECRET_CANARY"},
            {type: "disable", operationName: "URL Decode", value: "SECRET_CANARY"},
        ]);

        assert.equal(
            summary,
            "Latest WebMCP change: Added To Base64; Changed an argument for To Base64; " +
                "Moved From Hex; 1 more changes."
        );
        assert.equal(summary.includes("SECRET_CANARY"), false);
        assert.equal(summary.includes("URL Decode"), false);
    }),

    it("WebMCPCollaborationUI: should use a fixed summary for missing actions", () => {
        assert.equal(
            formatAgentChangeSummary(null),
            "Latest WebMCP change updated the Recipe."
        );
    }),

    it("WebMCPCollaborationUI: should format approval summaries without values", () => {
        const summary = formatApprovalSummary({
                operationNames: ["Generate HOTP"],
                changeTypes: [APPROVAL_CHANGE_TYPE.INSERT],
                sensitiveParameterNames: ["Secret"],
                riskFlags: [
                    APPROVAL_RISK_FLAG.SECRET_INPUT,
                    APPROVAL_RISK_FLAG.SENSITIVE_OUTPUT,
                ],
                value: "SECRET_CANARY",
            }),
            serialized = JSON.stringify(summary);

        assert.deepStrictEqual(summary, {
            operations: "Operations: Generate HOTP.",
            changes: "Requested Recipe effects: add an Operation.",
            parameters: "Values remain hidden. Sensitive parameters: Secret.",
            risks: "Additional effects: process sensitive Input data and produce sensitive output.",
        });
        assert.equal(serialized.includes("SECRET_CANARY"), false);
    }),
]);
