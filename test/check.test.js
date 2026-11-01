
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

test("visits schema-valued keywords without treating annotation data as schemas", () => {
    const schema = {
        properties: { a: { additionalProperties: { $dynamicRef: "#x" } } },
        $defs: { "x/y~z": { items: [{ $dynamicRef: "#x" }] } },
        if: { type: "string" }, then: { $dynamicRef: "#x" },
        else: false, not: { $dynamicRef: "#x" },
        anyOf: [{ $dynamicRef: "#x" }],
        default: { $dynamicRef: "ordinary data" },
        const: { $dynamicRef: "ordinary data" }
    };
    const paths = checkSchema(schema, { unsupportedKeywords: ["$dynamicRef"] }).map((issue) => issue.path);
    assert.deepEqual(paths, [
        "/$defs/x~1y~0z/items/0/$dynamicRef",
        "/properties/a/additionalProperties/$dynamicRef",
        "/not/$dynamicRef",
        "/then/$dynamicRef",
        "/anyOf/0/$dynamicRef"
    ]);
});

test("rejects invalid top-level schema values", () => {
    assert.throws(() => checkSchema(null), TypeError);
    assert.throws(() => checkSchema("invalid"), TypeError);
    assert.throws(() => checkSchema([]), TypeError);
});

test("validates scanner options", () => {
    assert.throws(() => checkSchema({}, null), /Options must be/);
    assert.throws(() => checkSchema({}, { unsupportedKeywords: "$ref" }), /unsupportedKeywords/);
    assert.throws(() => checkSchema({}, { unsupportedKeywords: [""] }), /unsupportedKeywords/);
    assert.throws(() => checkSchema({}, { target: " " }), /target/);
});
