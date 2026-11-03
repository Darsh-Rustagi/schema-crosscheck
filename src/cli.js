#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { checkSchema } from "./check.js";
import { compareSchema } from "./compare.js";

const usage = `schema-crosscheck — scan and compare JSON Schema validation

Usage:
  schema-crosscheck check <file-or-directory> --target <name> --unsupported <keywords>
  schema-crosscheck compare <schema.json> <cases.json> [--format text|json]

Options:
  --target <name>                 Target validator name (check)
  --unsupported <keywords>        Comma-separated keyword names (check)
  --format <text|json>            Output format (default: text)
  --help, -h                      Show this help

Compare case files contain an array of { "name": "...", "input": ... } objects.
Exit codes: 0 success/no findings, 1 warnings or mismatches, 2 execution error.
`;

function parseArgs(args) {
    if (args.length === 0 || args.includes("--help") || args.includes("-h")) return { help: true };
    const command = args[0];
    if (!["check", "compare"].includes(command)) throw new Error(`Unknown command: ${command}`);
    const positional = [];
    const options = { format: "text", target: "", unsupportedKeywords: [] };
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        if (["--format", "--target", "--unsupported"].includes(arg)) {
            const value = args[++i];
            if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
            if (arg === "--format") options.format = value;
            if (arg === "--target") options.target = value;
            if (arg === "--unsupported") options.unsupportedKeywords.push(...value.split(",").map((v) => v.trim()).filter(Boolean));
        } else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
        else positional.push(arg);
    }
    if (!["text", "json"].includes(options.format)) throw new Error('Format must be "text" or "json".');
    if (command === "check") {
        if (positional.length !== 1) throw new Error("check requires exactly one file or directory.");
        if (!options.target.trim()) throw new Error("check requires --target <name>.");
        if (!options.unsupportedKeywords.length) throw new Error("check requires --unsupported <keywords>.");
    } else if (positional.length !== 2) throw new Error("compare requires a schema file and a cases file.");
    return { help: false, command, positional, ...options };
}

async function readJson(path) {
    const content = await readFile(path, "utf8");
    try { return JSON.parse(content); }
    catch (error) { throw new Error(`Invalid JSON in ${path}: ${error.message}`); }
}

async function findSchemas(path) {
    const info = await stat(path);
    if (info.isFile()) return [path];
    if (!info.isDirectory()) throw new Error(`Not a file or directory: ${path}`);
    const files = [];
    async function walk(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            if (entry.isDirectory() && (entry.name.startsWith(".") || entry.name === "node_modules")) continue;
            const full = resolve(dir, entry.name);
            if (entry.isDirectory()) await walk(full);
            else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json" && !entry.name.endsWith(".cases.json")) files.push(full);
        }
    }
    await walk(path);
    if (!files.length) throw new Error(`No JSON files found in ${path}`);
    return files;
}

async function runCheck(options) {
    const files = await findSchemas(resolve(options.positional[0]));
    const issues = [];
    const errors = [];
    for (const file of files) {
        try {
            const schema = await readJson(file);
            for (const issue of checkSchema(schema, options)) issues.push({ file: relative(process.cwd(), file), ...issue });
        } catch (error) { errors.push({ file: relative(process.cwd(), file), message: error.message }); }
    }
    const result = { filesScanned: files.length, issues, errors };
    if (options.format === "json") console.log(JSON.stringify(result, null, 2));
    else {
        for (const issue of issues) console.log(`${issue.file}\n  Warning: ${issue.message}\n  Location: ${issue.path}`);
        for (const error of errors) console.error(`${error.file}\n  Error: ${error.message}`);
        console.log(`Files scanned: ${files.length}\nPotential issues: ${issues.length}\nFile errors: ${errors.length}`);
    }
    return errors.length ? 2 : issues.length ? 1 : 0;
}

async function runCompare(options) {
    const schemaPath = resolve(options.positional[0]);
    const casesPath = resolve(options.positional[1]);
    const schema = await readJson(schemaPath);
    const cases = await readJson(casesPath);
    if (!Array.isArray(cases) || cases.length === 0) throw new Error("Cases file must contain a non-empty JSON array.");
    const result = compareSchema(schema, cases);
    if (!result.conversionSucceeded) {
        if (options.format === "json") console.log(JSON.stringify(result, null, 2));
        else console.error(`Comparison failed during ${result.conversionError.stage}: ${result.conversionError.message}`);
        return 2;
    }
    if (options.format === "json") console.log(JSON.stringify(result, null, 2));
    else {
        console.log(`Compared ${result.totalInputs} inputs: ${result.agreements} agreements, ${result.mismatchCount} mismatches.`);
        for (const unsupported of result.unsupportedFeatures) console.log(`Unsupported feature: ${unsupported.keyword} at ${unsupported.path} (${unsupported.validator})`);
        for (const mismatch of result.mismatches) {
            console.log(`\n${mismatch.name} (input ${mismatch.index}) — ${mismatch.classification}`);
            console.log(`  Input: ${JSON.stringify(mismatch.input)}`);
            console.log(`  Ajv: ${mismatch.ajv.accepts ? "accept" : "reject"}; Zod: ${mismatch.zod.accepts ? "accept" : "reject"}`);
        }
    }
    return result.mismatchCount ? 1 : 0;
}

async function main() {
    let options;
    try { options = parseArgs(process.argv.slice(2)); }
    catch (error) { console.error(`Error: ${error.message}\n\n${usage}`); process.exitCode = 2; return; }
    if (options.help) { console.log(usage); return; }
    try {
        process.exitCode = options.command === "check" ? await runCheck(options) : await runCompare(options);
    } catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 2; }
}

main();
