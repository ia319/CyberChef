import assert from "assert";
import OperationConfig from "../../../src/core/config/OperationConfig.json" with { type: "json" };
import {
    OPERATION_CATALOG,
    OPERATION_DESCRIPTION_MAX_CODE_POINTS,
    createOperationCatalog,
    sanitizeOperationDescription,
} from "../../../src/web/webmcp/OperationCatalog.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const createConfig = entries => Object.fromEntries(entries.map(([name, description]) => [name, {
    description,
    module: "Default",
    inputType: "string",
    coreOutputType: "string",
    outputType: "string",
}]));


TestRegister.addApiTests([
    it("WebMCPOperationCatalog: should expose every generated Operation by exact name", () => {
        assert.equal(OPERATION_CATALOG.size, OPERATION_CATALOG.getOperationNames().length);
        assert.deepStrictEqual(OPERATION_CATALOG.getOperationNames(), Object.keys(OperationConfig));
        assert.equal(OPERATION_CATALOG.getOperation("To Base64").coreOutputType, "string");
        assert.equal(OPERATION_CATALOG.getOperation("Unzip").coreOutputType, "List<File>");
        assert.equal(OPERATION_CATALOG.getOperation("Unzip").presentType, "html");
        assert.equal(OPERATION_CATALOG.getOperation("to base64"), null);
    }),

    it("WebMCPOperationCatalog: should sanitize and bound fixed descriptions", () => {
        const description = "<p>Hello&nbsp;<b>world</b></p><script>SECRET_CANARY</script> &amp; " +
                "😀".repeat(OPERATION_DESCRIPTION_MAX_CODE_POINTS),
            result = sanitizeOperationDescription(description);

        assert.equal(result.includes("<"), false);
        assert.equal(result.includes("SECRET_CANARY"), false);
        assert.equal(result.startsWith("Hello world & "), true);
        assert.equal([...result].length, OPERATION_DESCRIPTION_MAX_CODE_POINTS);
        assert.equal(result.endsWith("…"), true);
    }),

    it("WebMCPOperationCatalog: should ignore greater-than characters inside tag attributes", () => {
        const result = sanitizeOperationDescription(
            "<a title=\"x > y\" data-label='a > b'>Link</a>"
        );

        assert.equal(result, "Link");
    }),

    it("WebMCPOperationCatalog: should rank name matches before description matches", () => {
        const catalog = createOperationCatalog(createConfig([
                ["Foo One", "First"],
                ["Foo Two", "Second"],
                ["Other", "A foo description"],
            ])),
            result = catalog.searchOperations("foo", 10, 0);

        assert.deepStrictEqual(result.items.map(entry => entry.name), ["Foo One", "Foo Two", "Other"]);
    }),

    it("WebMCPOperationCatalog: should paginate one stable result sequence", () => {
        const catalog = createOperationCatalog(createConfig([
                ["Encode Alpha", ""],
                ["Encode Beta", ""],
                ["Encode Gamma", ""],
                ["Other", "Encode description"],
            ])),
            all = catalog.searchOperations("encode", 10, 0),
            first = catalog.searchOperations("encode", 2, 0),
            second = catalog.searchOperations("encode", 2, first.nextOffset);

        assert.deepStrictEqual(first.items.concat(second.items), all.items);
        assert.equal(first.total, 4);
        assert.equal(first.nextOffset, 2);
        assert.equal(second.nextOffset, null);
    }),

    it("WebMCPOperationCatalog: should search Unicode names and reject invalid bounds", () => {
        const catalog = createOperationCatalog(createConfig([
            ["编码工具", "转换文本"],
            ["Other", "其他说明"],
        ]));

        assert.deepStrictEqual(catalog.searchOperations("编码", 5, 0).items.map(entry => entry.name), ["编码工具"]);
        assert.throws(() => catalog.searchOperations(" ", 5, 0), RangeError);
        assert.throws(() => catalog.searchOperations("x", 11, 0), RangeError);
        assert.throws(() => catalog.searchOperations("x", 5, -1), RangeError);
    }),

    it("WebMCPOperationCatalog: should handle prototype-like Operation names", () => {
        const config = Object.create(null);
        config.__proto__ = createConfig([["placeholder", "Description"]]).placeholder;
        config.constructor = createConfig([["placeholder", "Description"]]).placeholder;

        const catalog = createOperationCatalog(config);
        assert.equal(catalog.getOperation("__proto__").name, "__proto__");
        assert.equal(catalog.getOperation("constructor").name, "constructor");
        assert.equal(catalog.getOperation("toString"), null);
    }),
]);
