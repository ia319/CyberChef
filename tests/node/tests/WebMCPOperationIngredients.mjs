import assert from "assert";
import {
    INGREDIENT_OPTION_MAX_LIMIT,
    UNSUPPORTED_INGREDIENT_REASON,
    describeOperationIngredients,
} from "../../../src/web/webmcp/OperationIngredients.mjs";
import { OPERATION_CATALOG } from "../../../src/web/webmcp/OperationCatalog.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("WebMCPOperationIngredients: should map primitive defaults and constraints", () => {
        const fromHex = OPERATION_CATALOG.getOperationIngredients("From Hex"),
            toHex = OPERATION_CATALOG.getOperationIngredients("To Hex"),
            urlDecode = OPERATION_CATALOG.getOperationIngredients("URL Decode");

        assert.deepStrictEqual(fromHex.arguments[0], {
            version: "1",
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
            constraints: {
                allowEmpty: false,
                profileRule: "enum",
                exactOption: true,
            },
        });
        assert.equal(toHex.arguments[1].sourceType, "number");
        assert.equal(toHex.arguments[1].defaultValue, 0);
        assert.equal(toHex.arguments[1].constraints.profileRule, "constant");
        assert.equal(toHex.arguments[1].constraints.constant, 0);
        assert.equal(urlDecode.arguments[0].sourceType, "boolean");
        assert.equal(urlDecode.arguments[0].defaultValue, true);
    }),

    it("WebMCPOperationIngredients: should paginate exact fixed options", () => {
        const first = OPERATION_CATALOG.getOperationIngredients("From Hex", 0, 5),
            second = OPERATION_CATALOG.getOperationIngredients("From Hex", first.nextOptionOffset, 10);

        assert.equal(first.optionTotal, 12);
        assert.equal(first.options.length, 5);
        assert.equal(first.options[0].value, "Auto");
        assert.equal(first.options[0].valueIncluded, true);
        assert.equal(first.nextOptionOffset, 5);
        assert.equal(second.options.length, 7);
        assert.equal(second.nextOptionOffset, null);
    }),

    it("WebMCPOperationIngredients: should reject unsupported composite and dynamic types", () => {
        const cases = [
            ["AES Encrypt", 0, UNSUPPORTED_INGREDIENT_REASON.TOGGLE_STRING],
            ["AES Encrypt", 2, UNSUPPORTED_INGREDIENT_REASON.ARGUMENT_SELECTOR],
            ["DateTime Delta", 0, UNSUPPORTED_INGREDIENT_REASON.POPULATES_ARGUMENTS],
            ["Multiple Bombe", 0, UNSUPPORTED_INGREDIENT_REASON.POPULATES_ARGUMENTS],
            ["Colossus", 9, UNSUPPORTED_INGREDIENT_REASON.EDITABLE_OPTION],
            ["Colossus", 0, UNSUPPORTED_INGREDIENT_REASON.LABEL],
        ];

        for (const [operationName, argumentIndex, reason] of cases) {
            const argument = OPERATION_CATALOG.getOperationIngredients(operationName).arguments[argumentIndex];
            assert.equal(argument.supportedForPatch, false, operationName);
            assert.equal(argument.unsupportedReason, reason, operationName);
        }
    }),

    it("WebMCPOperationIngredients: should expose only profiled editable values", () => {
        const base64 = OPERATION_CATALOG.getOperationIngredients("From Base64", 0, 3);

        assert.equal(base64.arguments[0].optionCount, 2);
        assert.equal(base64.arguments[0].supportedForPatch, true);
        assert.equal(base64.arguments[0].defaultAvailable, true);
        assert.equal(base64.arguments[0].defaultValue, "A-Za-z0-9+/=");
        assert.deepStrictEqual(base64.options.map(option => option.value), [
            "A-Za-z0-9+/=",
            "A-Za-z0-9-_",
        ]);

        const unprofiled = describeOperationIngredients([{
            name: "Editable",
            type: "editableOption",
            value: [{name: "Choice", value: "custom"}],
        }]);
        assert.equal(unprofiled.arguments[0].supportedForPatch, false);
        assert.equal(unprofiled.options[0].valueIncluded, false);
    }),

    it("WebMCPOperationIngredients: should bound static text and large defaults", () => {
        const result = describeOperationIngredients([{
            name: "<b>Name</b><script>SECRET_CANARY</script>",
            hint: "Use&nbsp;plain text",
            type: "string",
            value: "x".repeat(300),
        }]);

        assert.equal(result.arguments[0].name, "Name");
        assert.equal(result.arguments[0].description, "Use plain text");
        assert.equal(result.arguments[0].defaultAvailable, false);
        assert.equal(result.arguments[0].defaultValue, null);
        assert.equal(JSON.stringify(result).includes("SECRET_CANARY"), false);
    }),

    it("WebMCPOperationIngredients: should reject unknown and disabled Ingredient types", () => {
        const result = describeOperationIngredients([
            {name: "Unknown", type: "futureType", value: "x"},
            {name: "Disabled", type: "string", value: "x", disabled: true},
        ]);

        assert.equal(result.arguments[0].unsupportedReason, UNSUPPORTED_INGREDIENT_REASON.UNKNOWN);
        assert.equal(result.arguments[1].unsupportedReason, UNSUPPORTED_INGREDIENT_REASON.DISABLED);
        assert.equal(result.arguments.every(argument => argument.supportedForPatch === false), true);
    }),

    it("WebMCPOperationIngredients: should recognize every generated Ingredient type", () => {
        for (const operationName of OPERATION_CATALOG.getOperationNames()) {
            const result = OPERATION_CATALOG.getOperationIngredients(operationName);
            for (const argument of result.arguments) {
                assert.notEqual(
                    argument.unsupportedReason,
                    UNSUPPORTED_INGREDIENT_REASON.UNKNOWN,
                    `${operationName}: ${argument.sourceType}`
                );
            }
        }
    }),

    it("WebMCPOperationIngredients: should reject invalid option pagination", () => {
        assert.throws(() => describeOperationIngredients([], -1, 1), RangeError);
        assert.throws(() => describeOperationIngredients([], 0, INGREDIENT_OPTION_MAX_LIMIT + 1), RangeError);
        assert.throws(() => describeOperationIngredients({}, 0, 1), TypeError);
        assert.equal(OPERATION_CATALOG.getOperationIngredients("Missing Operation"), null);
    }),
]);
