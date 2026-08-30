import assert from "assert";
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
]);
