
import test from "node:test";
import assert from "node:assert/strict";

import { checkSchema } from "../src/check.js";

test("returns no issues for a schema without unsupported keywords", () => {
    const schema = {
        type: "string"
    };

    assert.deepEqual(checkSchema(schema), []);
});

test("detects an unsupported keyword in a nested schema", () => {
    const schema = {
        type: "object",
        properties: {
            child: {
                properties: {
                    value: {
                        $dynamicRef: "#node"
                    }
                }
            }
        }
    };

    const issues = checkSchema(schema, {
        unsupportedKeywords: ["$dynamicRef"],
        target: "Zod"
    });

    assert.equal(issues.length, 1);
    assert.equal(issues[0].keyword, "$dynamicRef");

    assert.equal(
        issues[0].path,
        "/properties/child/properties/value/$dynamicRef"
    );

    assert.equal(issues[0].target, "Zod");
});

test("escapes special characters in JSON Pointer paths", () => {
    const schema = {
        properties: {
            "a/b~c": {
                $dynamicRef: "#node"
            }
        }
    };

    const issues = checkSchema(schema, {
        unsupportedKeywords: ["$dynamicRef"]
    });

    assert.equal(
        issues[0].path,
        "/properties/a~1b~0c/$dynamicRef"
    );
});

test("finds unsupported keywords inside allOf", () => {
    const schema = {
        allOf: [
            {
                properties: {
                    value: {
                        $dynamicRef: "#node"
                    }
                }
            }
        ]
    };

    const issues = checkSchema(schema, {
        unsupportedKeywords: ["$dynamicRef"]
    });

    assert.equal(issues.length, 1);
    assert.equal(
        issues[0].path,
        "/allOf/0/properties/value/$dynamicRef"
    );
});

test("does not inspect arbitrary data inside const", () => {
    const schema = {
        const: {
            $dynamicRef: "this is ordinary data"
        }
    };

    assert.deepEqual(
        checkSchema(schema, {
            unsupportedKeywords: ["$dynamicRef"]
        }),
        []
    );
});

test("accepts boolean JSON Schemas", () => {
    assert.deepEqual(checkSchema(true), []);
    assert.deepEqual(checkSchema(false), []);
});

test("rejects invalid top-level schema values", () => {
    assert.throws(() => checkSchema(null), TypeError);
    assert.throws(() => checkSchema("invalid"), TypeError);
    assert.throws(() => checkSchema([]), TypeError);
});
