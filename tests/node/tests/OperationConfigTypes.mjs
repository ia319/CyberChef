import assert from "assert";
import OperationConfig from "../../../src/core/config/OperationConfig.json" with { type: "json" };
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("OperationConfig: should preserve core and presentation output types", () => {
        for (const config of Object.values(OperationConfig)) {
            assert.equal(typeof config.coreOutputType, "string");
            assert.equal(typeof config.outputType, "string");
        }

        assert.equal(OperationConfig.Unzip.coreOutputType, "List<File>");
        assert.equal(OperationConfig.Unzip.outputType, "html");
        assert.equal(OperationConfig["From Base64"].coreOutputType, "byteArray");
        assert.equal(OperationConfig["From Base64"].outputType, "byteArray");
    }),
]);
