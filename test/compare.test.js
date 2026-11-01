import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compareSchema } from "../src/index.js";

test("reports agreement for valid and invalid inputs", () => {
    const result = compareSchema({ type: "integer" }, [1, "bad"]);
    assert.equal(result.conversionSucceeded, true);
    assert.equal(result.totalInputs, 2);
    assert.equal(result.agreements, 2);
    assert.equal(result.mismatchCount, 0);
});

test("reports the verified nested dynamicRef disagreement and limitation", async () => {
    const root = new URL("../schemas/", import.meta.url);
    const schema = JSON.parse(await readFile(new URL("dynamic-ref.schema.json", root), "utf8"));
    const cases = JSON.parse(await readFile(new URL("dynamic-ref.cases.json", root), "utf8"));
    const result = compareSchema(schema, cases);
    assert.equal(result.conversionSucceeded, true);
    assert.equal(result.mismatchCount, 1);
    assert.equal(result.mismatches[0].ajv.accepts, false);
    assert.equal(result.mismatches[0].zod.accepts, true);
    assert.equal(result.mismatches[0].classification, "unsupported-feature");
    assert.ok(result.unsupportedFeatures.some(({ keyword }) => keyword === "$dynamicRef"));
    assert.equal(result.mismatches[0].name, "nested value has wrong type");
    assert.equal(result.mismatches[0].ajv.errors[0].keyword, "type");
});

test("returns an explicit Ajv compilation failure", () => {
    const result = compareSchema({ $ref: "#/$defs/missing", $defs: {} }, [1]);
    assert.equal(result.conversionSucceeded, false);
    assert.equal(result.conversionError.stage, "ajv-compilation");
});

test("returns an explicit Zod conversion failure", () => {
    const result = compareSchema({
        $schema: "https://json-schema.org/draft/2019-09/schema",
        type: "object", dependentRequired: { account: ["email"] }
    }, [{ account: true }]);
    assert.equal(result.conversionSucceeded, false);
    assert.equal(result.conversionError.stage, "zod-conversion");
});

test("validates inputs and supports boolean schemas", () => {
    assert.throws(() => compareSchema(true, []), /non-empty array/);
    assert.throws(() => compareSchema(null, [1]), /Schema must be/);
    assert.throws(() => compareSchema(true, "bad"), /non-empty array/);
    assert.equal(compareSchema(true, [1]).agreements, 1);
    assert.equal(compareSchema(false, [1]).agreements, 1);
});
