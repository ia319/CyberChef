/**
 * Quoted Printable tests.
 *
 * @copyright Crown Copyright 2026
 * @license Apache-2.0
 */
import TestRegister from "../../lib/TestRegister.mjs";


TestRegister.addTests([
    {
        name: "To Quoted Printable: empty input",
        input: "",
        expectedOutput: "",
        recipeConfig: [
            {op: "To Quoted Printable", args: []},
        ],
    },
    {
        name: "To Quoted Printable: raw bytes",
        input: "413dff",
        expectedOutput: "A=3D=FF",
        recipeConfig: [
            {op: "From Hex", args: ["Auto"]},
            {op: "To Quoted Printable", args: []},
        ],
    },
    {
        name: "From Quoted Printable: encoded bytes",
        input: "A=3D=FF",
        expectedOutput: "413dff",
        recipeConfig: [
            {op: "From Quoted Printable", args: []},
            {op: "To Hex", args: ["None"]},
        ],
    },
    {
        name: "Quoted Printable: soft line break",
        input: "hello=20=\r\nworld",
        expectedOutput: "hello world",
        recipeConfig: [
            {op: "From Quoted Printable", args: []},
        ],
    },
]);
