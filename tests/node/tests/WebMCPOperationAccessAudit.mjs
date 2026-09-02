import assert from "assert";
import OperationConfig from "../../../src/core/config/OperationConfig.json" with { type: "json" };
import {
    OPERATION_ACCESS,
    OPERATION_ACCESS_AUDIT,
} from "../../../src/web/webmcp/OperationAccessAudit.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPOperationAccessAudit: should classify every generated Operation exactly once", () => {
        const auditedNames = OPERATION_ACCESS_AUDIT.getOperationNames(),
            generatedNames = Object.keys(OperationConfig),
            counts = Object.fromEntries(Object.values(OPERATION_ACCESS).map(access => [access, 0]));

        assert.equal(OPERATION_ACCESS_AUDIT.size, 504);
        assert.equal(new Set(auditedNames).size, auditedNames.length);
        assert.deepStrictEqual([...auditedNames].sort(), [...generatedNames].sort());
        for (const operationName of auditedNames) {
            counts[OPERATION_ACCESS_AUDIT.getOperationAccess(operationName)]++;
            assert.equal(OPERATION_ACCESS_AUDIT.hasOperation(operationName), true);
        }
        assert.deepStrictEqual(counts, {
            direct: 447,
            approval: 51,
            blocked: 5,
            excluded: 1,
            unreviewed: 0,
        });
        assert.equal(OPERATION_ACCESS_AUDIT.getOperationAccess("Magic"), OPERATION_ACCESS.BLOCKED);
        assert.equal(OPERATION_ACCESS_AUDIT.getOperationAccess("Register"), OPERATION_ACCESS.APPROVAL);
        assert.equal(OPERATION_ACCESS_AUDIT.getOperationAccess("Reverse"), OPERATION_ACCESS.DIRECT);
        assert.equal(
            OPERATION_ACCESS_AUDIT.getOperationAccess("Automated Validation Test Op"),
            OPERATION_ACCESS.EXCLUDED
        );
        assert.equal(OPERATION_ACCESS_AUDIT.hasOperation("SECRET_OPERATION_CANARY"), false);
        assert.equal(
            OPERATION_ACCESS_AUDIT.getOperationAccess("SECRET_OPERATION_CANARY"),
            OPERATION_ACCESS.UNREVIEWED
        );
    }),
]);
