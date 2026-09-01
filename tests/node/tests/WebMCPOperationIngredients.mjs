import assert from "assert";
import OperationConfig from "../../../src/core/config/OperationConfig.json" with { type: "json" };
import {OPERATION_CATALOG} from "../../../src/web/webmcp/OperationCatalog.mjs";
import {
    INGREDIENT_OPTION_MAX_LIMIT,
    UNSUPPORTED_INGREDIENT_REASON,
    describeOperationIngredients,
} from "../../../src/web/webmcp/OperationIngredients.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPOperationIngredients: should expose core defaults and constraints", () => {
        const fromHex = OPERATION_CATALOG.getOperationIngredients("From Hex"),
            toBinary = OPERATION_CATALOG.getOperationIngredients("To Binary");

        assert.deepStrictEqual(fromHex.arguments[0], {
            version: "2",
            argumentIndex: 0,
            name: "Delimiter",
            description: "",
            sourceType: "option",
            valueType: "string",
            defaultAvailable: true,
            defaultValue: "Auto",
            supportedForPatch: true,
            unsupportedReason: null,
            optionCount: 12,
            constraints: {allowEmpty: true, exactOption: true},
        });
        assert.deepStrictEqual(toBinary.arguments[1].constraints, {
            allowEmpty: true,
            finite: true,
            integer: true,
            minimum: 1,
            maximum: 256,
            step: null,
        });
    }),

    it("WebMCPOperationIngredients: should support every generated Recipe argument shape", () => {
        const editable = OPERATION_CATALOG.getOperationIngredients("To Base64"),
            toggle = OPERATION_CATALOG.getOperationIngredients("ADD");

        assert.equal(editable.arguments[0].supportedForPatch, true);
        assert.equal(editable.arguments[0].constraints.editable, true);
        assert.equal(editable.options[0].valueIncluded, true);
        assert.equal(editable.options[0].value, "A-Za-z0-9+/=");
        assert.equal(toggle.arguments[0].valueType, "toggleString");
        assert.deepStrictEqual(toggle.arguments[0].defaultValue, {option: "Hex", string: ""});

        for (const operationName of OPERATION_CATALOG.getOperationNames()) {
            const result = OPERATION_CATALOG.getOperationIngredients(operationName);
            for (const argument of result.arguments) {
                const source = OperationConfig[operationName].args[argument.argumentIndex];
                assert.notEqual(
                    argument.unsupportedReason,
                    UNSUPPORTED_INGREDIENT_REASON.UNKNOWN,
                    `${operationName}: ${argument.sourceType}`
                );
                assert.equal(
                    argument.supportedForPatch,
                    source.disabled !== true,
                    `${operationName}: ${argument.argumentIndex}`
                );
            }
        }
    }),

    it("WebMCPOperationIngredients: should paginate exact static options", () => {
        const first = OPERATION_CATALOG.getOperationIngredients("To Base64", 0, 2),
            second = OPERATION_CATALOG.getOperationIngredients("To Base64", first.nextOptionOffset, 2);

        assert.deepStrictEqual(first.options.map(option => option.value), [
            "A-Za-z0-9+/=",
            "A-Za-z0-9-_",
        ]);
        assert.equal(first.nextOptionOffset, 2);
        assert.equal(second.optionOffset, 2);
        assert.equal(second.options.some(option => option.value === first.options[0].value), false);
    }),

    it("WebMCPOperationIngredients: should sanitize metadata and reject invalid inputs", () => {
        const longDefault = "x".repeat(300),
            result = describeOperationIngredients([{
                name: "<b>Name</b><script>SECRET_CANARY</script>",
                hint: "Use&nbsp;plain text",
                type: "string",
                value: longDefault,
            }], 0, 20, [longDefault]),
            unsupported = describeOperationIngredients([
                {name: "Unknown", type: "futureType", value: "x"},
                {name: "Disabled", type: "string", value: "x", disabled: true},
            ], 0, 20, ["x", "x"]);

        assert.equal(result.arguments[0].name, "Name");
        assert.equal(result.arguments[0].description, "Use plain text");
        assert.equal(result.arguments[0].defaultAvailable, true);
        assert.equal(result.arguments[0].defaultValue, longDefault);
        assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
        assert.equal(unsupported.arguments[0].unsupportedReason, UNSUPPORTED_INGREDIENT_REASON.UNKNOWN);
        assert.equal(unsupported.arguments[1].unsupportedReason, UNSUPPORTED_INGREDIENT_REASON.DISABLED);
        assert.throws(() => describeOperationIngredients([], -1, 1), RangeError);
        assert.throws(() => describeOperationIngredients([], 0, INGREDIENT_OPTION_MAX_LIMIT + 1), RangeError);
        assert.throws(() => describeOperationIngredients({}, 0, 1), TypeError);
        assert.throws(() => describeOperationIngredients([], 0, 1, ["extra"]), RangeError);
        assert.equal(OPERATION_CATALOG.getOperationIngredients("Missing Operation"), null);
    }),
]);
