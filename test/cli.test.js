import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = join(root, "src/cli.js");
function run(args) { return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" }); }

test("shows help and validates command arguments", () => {
    const help = run(["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /schema-crosscheck compare/);
    assert.equal(run(["unknown"]).status, 2);
    assert.equal(run(["check", "schemas"]).status, 2);
    assert.equal(run(["compare", "a.json"]).status, 2);
});

test("compare CLI prints readable output and valid JSON with correct exit code", () => {
    const args = ["compare", "schemas/user.schema.json", "schemas/user.cases.json"];
    const text = run(args);
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /2 inputs: 2 agreements, 0 mismatches/);
    const json = run([...args, "--format", "json"]);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).agreements, 2);
});

test("check CLI returns warning exit code and machine-readable output", () => {
    const args = ["check", "schemas", "--target", "Zod", "--unsupported", "$dynamicRef"];
    const text = run(args);
    assert.equal(text.status, 1);
    assert.match(text.stdout, /Potential issues: 2/);
    const json = run([...args, "--format", "json"]);
    assert.equal(json.status, 1);
    assert.equal(JSON.parse(json.stdout).issues.length, 2);
    assert.equal(json.stderr, "");
});

test("reports missing files, malformed JSON, and schema compilation errors", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "schema-crosscheck-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    assert.equal(run(["compare", join(dir, "missing.json"), join(dir, "cases.json")]).status, 2);
    const schemaPath = join(dir, "schema.json");
    const casesPath = join(dir, "cases.json");
    await writeFile(schemaPath, "{");
    await writeFile(casesPath, "[]");
    assert.equal(run(["compare", schemaPath, casesPath]).status, 2);
    await writeFile(schemaPath, JSON.stringify({ $ref: "#/$defs/missing", $defs: {} }));
    await writeFile(casesPath, JSON.stringify([{ name: "case", input: {} }]));
    const failed = run(["compare", schemaPath, casesPath, "--format", "json"]);
    assert.equal(failed.status, 2);
    assert.equal(JSON.parse(failed.stdout).conversionSucceeded, false);
});

test("directory scans skip hidden and dependency directories", async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "schema-crosscheck-scan-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await writeFile(join(dir, "schema.json"), JSON.stringify({ type: "string" }));
    for (const ignored of ["node_modules", ".git", ".cache"]) {
        const subdir = join(dir, ignored);
        await mkdir(subdir);
        await writeFile(join(subdir, "not-a-schema.json"), "invalid");
    }
    const result = run(["check", dir, "--target", "Zod", "--unsupported", "$ref", "--format", "json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).filesScanned, 1);
});
