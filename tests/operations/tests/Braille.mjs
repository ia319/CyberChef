/**
 * Braille conversion tests.
 *
 * @copyright Crown Copyright 2026
 * @license Apache-2.0
 */
import TestRegister from "../../lib/TestRegister.mjs";

TestRegister.addTests([
    {
        name: "To Braille: letters, space and digits",
        input: "ABC 123",
        expectedOutput: "⠁⠃⠉⠀⠂⠆⠒",
        recipeConfig: [
            {
                op: "To Braille",
                args: [],
            },
        ],
    }, {
        name: "From Braille: letters, space and digits",
        input: "⠁⠃⠉⠀⠂⠆⠒",
        expectedOutput: "ABC 123",
        recipeConfig: [
            {
                op: "From Braille",
                args: [],
            },
        ],
    }, {
        name: "Braille: Preserve unknown text",
        input: "🙂",
        expectedOutput: "🙂",
        recipeConfig: [
            {
                op: "To Braille",
                args: [],
            }, {
                op: "From Braille",
                args: [],
            },
        ],
    },
]);
