import assert from "assert";
import {APPROVAL_RISK_FLAG} from "../../../src/web/webmcp/ApprovalRisk.mjs";
import {
    OPERATION_ACCESS,
    OPERATION_ACCESS_AUDIT,
} from "../../../src/web/webmcp/OperationAccessAudit.mjs";
import {OPERATION_APPROVAL_POLICY} from
    "../../../src/web/webmcp/OperationApprovalPolicy.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPOperationApprovalPolicy: should disclose every approval Operation", () => {
        const approvalNames = OPERATION_ACCESS_AUDIT.getOperationNames().filter(operationName =>
            OPERATION_ACCESS_AUDIT.getOperationAccess(operationName) === OPERATION_ACCESS.APPROVAL
        );

        assert.equal(OPERATION_APPROVAL_POLICY.size, 51);
        assert.deepStrictEqual(OPERATION_APPROVAL_POLICY.getOperationNames(), approvalNames);
        for (const operationName of approvalNames) {
            const summary = OPERATION_APPROVAL_POLICY.getOperationSummary(operationName);
            assert(summary, operationName);
            assert(summary.riskFlags.length > 0, operationName);
            assert.deepStrictEqual(summary.sensitiveParameterNames, [], operationName);
        }
        assert.deepStrictEqual(
            OPERATION_APPROVAL_POLICY.getOperationSummary("HTTP request").riskFlags,
            [APPROVAL_RISK_FLAG.NETWORK_ACCESS]
        );
        assert.deepStrictEqual(
            OPERATION_APPROVAL_POLICY.getOperationSummary("Render PDF").riskFlags,
            [APPROVAL_RISK_FLAG.RICH_CONTENT]
        );
        assert.deepStrictEqual(
            OPERATION_APPROVAL_POLICY.getOperationSummary("Get Time").riskFlags,
            [APPROVAL_RISK_FLAG.NONDETERMINISTIC]
        );
        assert.deepStrictEqual(
            OPERATION_APPROVAL_POLICY.getOperationSummary("Jump").riskFlags,
            [APPROVAL_RISK_FLAG.RECIPE_FLOW]
        );
        assert.deepStrictEqual(
            OPERATION_APPROVAL_POLICY.getOperationSummary("Register").riskFlags,
            [APPROVAL_RISK_FLAG.INPUT_DERIVED_ARGUMENTS]
        );
        assert.equal(OPERATION_APPROVAL_POLICY.getOperationSummary("To Base64"), null);
    }),
]);
