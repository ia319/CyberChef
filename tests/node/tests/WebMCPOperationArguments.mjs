import assert from "assert";
import OperationConfig from "../../../src/core/config/OperationConfig.json" with { type: "json" };
import {
    OPERATION_ARGUMENT_ERROR_CODE,
    resolveOperationArguments,
} from "../../../src/web/webmcp/OperationArguments.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPOperationArguments: should resolve browser defaults for every product Operation", () => {
        for (const [operationName, operation] of Object.entries(OperationConfig)) {
            if (operationName === "Automated Validation Test Op") continue;
            const result = resolveOperationArguments(operationName);
            assert.equal(result.valid, true, operationName);
            assert.equal(result.arguments.length, operation.args.length, operationName);
            assert.equal(Object.isFrozen(result.arguments), true, operationName);
        }
        assert.equal(resolveOperationArguments("Automated Validation Test Op").valid, false);
    }),

    it("WebMCPOperationArguments: should preserve browser coercion for legacy defaults", () => {
        assert.deepStrictEqual(resolveOperationArguments("Generate Lorem Ipsum").arguments, [
            3, "Paragraphs",
        ]);
        assert.deepStrictEqual(resolveOperationArguments("Unicode Text Format").arguments, [true, true]);
        assert.deepStrictEqual(resolveOperationArguments("Rison Decode").arguments, ["Decode"]);
    }),

    it("WebMCPOperationArguments: should preserve composite and large Operation shapes", () => {
        const toggle = resolveOperationArguments("ADD"),
            colossus = resolveOperationArguments("Colossus");

        assert.deepStrictEqual(toggle.arguments, [{option: "Hex", string: ""}]);
        assert.equal(Object.isFrozen(toggle.arguments[0]), true);
        assert.equal(colossus.arguments.length, 57);
        assert.equal(colossus.arguments[0], "");
        assert.equal(colossus.arguments[6], "Select Program");
    }),

    it("WebMCPOperationArguments: should apply visible population presets", () => {
        const defaults = resolveOperationArguments("Multiple Bombe"),
            custom = resolveOperationArguments("Multiple Bombe", [
                "User defined", "CANARY", "CANARY", "CANARY", "", 0, true,
            ]);

        assert.equal(defaults.valid, true);
        assert.notEqual(defaults.arguments[1], "");
        assert.deepStrictEqual(custom.arguments.slice(1, 4), ["", "", ""]);
    }),

    it("WebMCPOperationArguments: should enforce upstream Ingredient values", () => {
        assert.equal(resolveOperationArguments("To Charcode", ["Space", 16]).valid, true);
        assert.deepStrictEqual(resolveOperationArguments("To Charcode", ["Unknown", 16]), {
            valid: false,
            code: OPERATION_ARGUMENT_ERROR_CODE.ARGUMENT_VALUE,
        });
        assert.equal(resolveOperationArguments("ADD", [{option: "Hex", string: "01"}]).valid, true);
        assert.equal(resolveOperationArguments("ADD", [{option: "Unknown", string: "01"}]).valid, false);
        assert.equal(resolveOperationArguments("ADD", [{option: "Hex", string: "01", extra: true}]).valid, false);
    }),

    it("WebMCPOperationArguments: should reject unknown Operations and incomplete arguments", () => {
        assert.deepStrictEqual(resolveOperationArguments("SECRET_UNKNOWN_OPERATION"), {
            valid: false,
            code: OPERATION_ARGUMENT_ERROR_CODE.UNKNOWN_OPERATION,
        });
        assert.deepStrictEqual(resolveOperationArguments("ADD", []), {
            valid: false,
            code: OPERATION_ARGUMENT_ERROR_CODE.ARGUMENT_COUNT,
        });
    }),
]);
