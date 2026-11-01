#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { checkSchema } from "./check.js";

function printUsage() {
    console.log(`
Schema Sentinel

Usage:
  schema-sentinel check <file-or-directory> --target <name> --unsupported <keywords>

Options:
  --target <name>                 Name of the target validator
  --unsupported <keywords>        Comma-separated unsupported keywords
  --format <text|json>            Output format (default: text)
  --help                          Show this help message

Example:
  schema-sentinel check ./schemas --target Zod --unsupported '$dynamicRef'
`);
}

function parseArguments(args) {
    const options = {
        target: "",
        unsupportedKeywords: [],
        format: "text"
    };

    const positional = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "--help" || arg === "-h") {
            return { help: true };
        }

        if (
            arg === "--target" ||
            arg === "--unsupported" ||
            arg === "--format"
        ) {
            const value = args[++i];

            if (!value || value.startsWith("--")) {
                throw new Error(`Missing value for ${arg}`);
            }

            if (arg === "--target") {
                options.target = value;
            }

            if (arg === "--unsupported") {
                options.unsupportedKeywords = value
                    .split(",")
                    .map((keyword) => keyword.trim())
                    .filter(Boolean);
            }

            if (arg === "--format") {
                options.format = value;
            }

            continue;
        }

        if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        }

        positional.push(arg);
    }

    if (positional[0] !== "check" || !positional[1]) {
        throw new Error("Provide the check command and a file or directory.");
    }

    if (!options.target) {
        throw new Error("Provide a target using --target.");
    }

    if (options.unsupportedKeywords.length === 0) {
        throw new Error(
            "Provide at least one keyword using --unsupported."
        );
    }

    if (!["text", "json"].includes(options.format)) {
        throw new Error('Format must be "text" or "json".');
    }

    return {
        help: false,
        input: resolve(positional[1]),
        ...options
    };
}

async function findSchemaFiles(inputPath) {
    const info = await stat(inputPath);

    if (info.isFile()) {
        return [inputPath];
    }

    if (!info.isDirectory()) {
        throw new Error("Input must be a JSON file or a directory.");
    }

    const files = [];

    async function walk(directory) {
        const entries = await readdir(directory, {
            withFileTypes: true
        });

        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            const fullPath = resolve(directory, entry.name);

            if (
                entry.isDirectory() &&
                ["node_modules", ".git", ".next"].includes(entry.name)
            ) {
                continue;
            }

            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (
                entry.isFile() &&
                extname(entry.name).toLowerCase() === ".json"
            ) {
                files.push(fullPath);
            }
        }
    }

    await walk(inputPath);

    return files;
}

async function main() {
    let options;

    try {
        options = parseArguments(process.argv.slice(2));
    } catch (error) {
        console.error(`Error: ${error.message}\n`);
        printUsage();
        process.exitCode = 2;
        return;
    }

    if (options.help) {
        printUsage();
        return;
    }

    let files;

    try {
        files = await findSchemaFiles(options.input);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 2;
        return;
    }

    if (files.length === 0) {
        console.error("No JSON files found.");
        process.exitCode = 2;
        return;
    }

    const issues = [];
    const errors = [];

    for (const file of files) {
        let schema;

        try {
            const content = await readFile(file, "utf8");
            schema = JSON.parse(content);
        } catch (error) {
            errors.push({
                file: relative(process.cwd(), file),
                message: error.message
            });
            continue;
        }

        try {
            const fileIssues = checkSchema(schema, {
                target: options.target,
                unsupportedKeywords: options.unsupportedKeywords
            });

            for (const issue of fileIssues) {
                issues.push({
                    file: relative(process.cwd(), file),
                    ...issue
                });
            }
        } catch (error) {
            errors.push({
                file: relative(process.cwd(), file),
                message: error.message
            });
        }
    }

    if (options.format === "json") {
        console.log(
            JSON.stringify(
                {
                    filesScanned: files.length,
                    issues,
                    errors
                },
                null,
                2
            )
        );
    } else {
        for (const issue of issues) {
            console.log(`\n${issue.file}`);
            console.log(`  ERROR  Potential compatibility gap`);
            console.log(`  Target:   ${issue.target}`);
            console.log(`  Keyword:  ${issue.keyword}`);
            console.log(`  Location: ${issue.path}`);
            console.log(`  ${issue.message}`);
        }

        for (const error of errors) {
            console.error(`\n${error.file}`);
            console.error(`  ERROR  ${error.message}`);
        }

        console.log(`\nFiles scanned: ${files.length}`);
        console.log(`Potential issues: ${issues.length}`);
        console.log(`File errors: ${errors.length}`);

        if (issues.length === 0 && errors.length === 0) {
            console.log(
                "\nNo configured compatibility warnings found."
            );
            console.log(
                "This does not prove that the validators are equivalent."
            );
        }
    }

    if (errors.length > 0) {
        process.exitCode = 2;
    } else if (issues.length > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(`Unexpected error: ${error.message}`);
    process.exitCode = 2;
});
