
import test from "node:test";
import assert from "node:assert/strict";

import Ajv2020 from "ajv/dist/2020.js";
import * as z from "zod";

test("reproduces the reported $dynamicRef validation gap", () => {
    const schema = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $ref: "#/$defs/node",
        $defs: {
            node: {
                $dynamicAnchor: "node",
                type: "object",
                required: ["value"],
                properties: {
                    value: {
                        type: "number"
                    },
                    child: {
                        $dynamicRef: "#node"
                    }
                }
            }
        }
    };

    // This input is invalid because a nested value must be a number.
    const input = {
        value: 1,
        child: {
            value: "not a number"
        }
    };

    // Validate the input against JSON Schema using Ajv.
    const ajv = new Ajv2020({
        allErrors: true
    });

    const validateWithAjv = ajv.compile(schema);
    const ajvAccepts = validateWithAjv(input);

    const zodSchema = z.fromJSONSchema(schema);
    const zodResult = zodSchema.safeParse(input);
    const zodAccepts = zodResult.success;

    console.log("\nDifferential validation results:");
    console.log("Ajv accepts input:", ajvAccepts);
    console.log("Zod accepts input:", zodAccepts);

    if (validateWithAjv.errors) {
        console.log(
            "Ajv errors:",
            JSON.stringify(validateWithAjv.errors, null, 2)
        );
    }

    assert.equal(
        ajvAccepts,
        false,
        "Ajv should reject the invalid nested value."
    );

    assert.equal(
        zodAccepts,
        true,
        "This reproduction expects Zod 4.5.0 to accept the invalid nested value."
    );
});
