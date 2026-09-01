/**
 * Hex to PEM tests.
 *
 * @copyright Crown Copyright 2026
 * @license Apache-2.0
 */
import TestRegister from "../../lib/TestRegister.mjs";

TestRegister.addTests([
    {
        name: "Hex to PEM: Certificate",
        input: "596164612059616461",
        expectedOutput: "-----BEGIN CERTIFICATE-----\r\nWWFkYSBZYWRh\r\n-----END CERTIFICATE-----\r\n",
        recipeConfig: [
            {
                op: "Hex to PEM",
                args: ["CERTIFICATE"],
            },
        ],
    }, {
        name: "Hex to PEM: RSA private key with whitespace",
        input: "59 61 64 61 20 59 61 64 61",
        expectedOutput: "-----BEGIN RSA PRIVATE KEY-----\r\nWWFkYSBZYWRh\r\n-----END RSA PRIVATE KEY-----\r\n",
        recipeConfig: [
            {
                op: "Hex to PEM",
                args: ["RSA PRIVATE KEY"],
            },
        ],
    },
]);
