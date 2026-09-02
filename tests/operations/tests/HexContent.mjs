/**
 * Hex Content tests.
 *
 * @copyright Crown Copyright 2026
 * @license Apache-2.0
 */
import TestRegister from "../../lib/TestRegister.mjs";


TestRegister.addTests([
    {
        name: "To Hex Content: special characters",
        input: "foo=bar baz",
        expectedOutput: "foo|3d|bar baz",
        recipeConfig: [
            {op: "To Hex Content", args: ["Only special chars", false]},
        ],
    },
    {
        name: "To Hex Content: all raw bytes",
        input: "003dff",
        expectedOutput: "|00 3d ff|",
        recipeConfig: [
            {op: "From Hex", args: ["Auto"]},
            {op: "To Hex Content", args: ["All chars", true]},
        ],
    },
    {
        name: "From Hex Content: mixed text and bytes",
        input: "foo|3d|bar|00 ff|",
        expectedOutput: "666f6f3d62617200ff",
        recipeConfig: [
            {op: "From Hex Content", args: []},
            {op: "To Hex", args: ["None"]},
        ],
    },
    {
        name: "Hex Content: invalid group remains text",
        input: "foo|xyz|bar",
        expectedOutput: "foo|xyz|bar",
        recipeConfig: [
            {op: "From Hex Content", args: []},
        ],
    },
]);
