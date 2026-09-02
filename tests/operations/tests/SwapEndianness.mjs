/**
 * Swap endianness tests.
 *
 * @copyright Crown Copyright 2026
 * @license Apache-2.0
 */
import TestRegister from "../../lib/TestRegister.mjs";

TestRegister.addTests([
    {
        name: "Swap endianness: Hex with padding",
        input: "001122334455",
        expectedOutput: "33 22 11 00 00 00 55 44",
        recipeConfig: [
            {
                op: "Swap endianness",
                args: ["Hex", 4, true],
            },
        ],
    }, {
        name: "Swap endianness: Hex without padding",
        input: "001122334455",
        expectedOutput: "33 22 11 00 55 44",
        recipeConfig: [
            {
                op: "Swap endianness",
                args: ["Hex", 4, false],
            },
        ],
    }, {
        name: "Swap endianness: Raw bytes",
        input: "abcd",
        expectedOutput: "badc",
        recipeConfig: [
            {
                op: "Swap endianness",
                args: ["Raw", 2, true],
            },
        ],
    },
]);
