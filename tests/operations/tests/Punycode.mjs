/**
 * Punycode tests.
 *
 * @copyright Crown Copyright 2026
 * @license Apache-2.0
 */
import TestRegister from "../../lib/TestRegister.mjs";


TestRegister.addTests([
    {
        name: "To Punycode: raw label",
        input: "münchen",
        expectedOutput: "mnchen-3ya",
        recipeConfig: [
            {op: "To Punycode", args: [false]},
        ],
    },
    {
        name: "From Punycode: raw label",
        input: "mnchen-3ya",
        expectedOutput: "münchen",
        recipeConfig: [
            {op: "From Punycode", args: [false]},
        ],
    },
    {
        name: "To Punycode: internationalised domain",
        input: "münchen.example",
        expectedOutput: "xn--mnchen-3ya.example",
        recipeConfig: [
            {op: "To Punycode", args: [true]},
        ],
    },
    {
        name: "From Punycode: internationalised domain",
        input: "xn--mnchen-3ya.example",
        expectedOutput: "münchen.example",
        recipeConfig: [
            {op: "From Punycode", args: [true]},
        ],
    },
]);
