# schema-crosscheck

`schema-crosscheck` is a JavaScript tool by Darsh Rustagi for finding configured JSON Schema compatibility risks and comparing validation outcomes from Ajv and Zod 4. It is a static scanner and test runner; it does not prove that two validators are equivalent.

## Requirements and install

Node.js 20 or newer is required.

```sh
npm install
npm test
npm link                    # optional: install the CLI locally
```

After the package is published, install it in a project with `npm install schema-crosscheck`; the `schema-crosscheck` executable is registered from the package's `bin` entry.

The runtime dependencies are [Ajv](https://ajv.js.org/) to validate the original JSON Schema and [Zod 4](https://zod.dev/) to import and validate its converted schema. The test suite and CLI use Node.js built-ins; there is no runtime or test framework wrapper dependency.

## CLI

Scan a schema file or a directory of JSON schemas. Hidden directories and `node_modules` are excluded; `*.cases.json` files are skipped.

```sh
node src/cli.js check ./schemas --target Zod --unsupported '$dynamicRef'
node src/cli.js check ./schemas --target Zod --unsupported '$dynamicRef' --format json
```

Compare an individual schema with a JSON file containing named inputs:

```sh
node src/cli.js compare ./schemas/user.schema.json ./schemas/user.cases.json
node src/cli.js compare ./schemas/user.schema.json ./schemas/user.cases.json --format json
# Reproduce the nested $dynamicRef report (exit code 1 because of the mismatch)
node src/cli.js compare ./schemas/dynamic-ref.schema.json ./schemas/dynamic-ref.cases.json
```

Case file format:

```json
[
  { "name": "valid user", "input": { "name": "Alex", "age": 20 } },
  { "name": "invalid age", "input": { "name": "Alex", "age": "wrong" } }
]
```

Exit codes are `0` when execution succeeds with no warnings or mismatches, `1` when configured scanner warnings or validation mismatches are found, and `2` for invalid arguments, unreadable or malformed files, schema compilation errors, or conversion failures. With `--format json`, the command writes only JSON to stdout; actionable execution errors can still be written to stderr.

## JavaScript API

```js
import { checkSchema, compareSchema } from "schema-crosscheck";

const issues = checkSchema(schema, {
  target: "Zod",
  unsupportedKeywords: ["$dynamicRef"]
});

const report = compareSchema(schema, [
  { name: "expected valid", input: { name: "Alex", age: 20 } },
  { name: "wrong age type", input: { name: "Alex", age: "old" } }
]);

console.log(report.mismatches);
```

`checkSchema(schema, options)` accepts object or boolean schemas. It traverses schema-valued keywords such as `properties`, `$defs`, `items`, composition branches, and conditionals. Its `path` values are JSON Pointers with escaped segments. `unsupportedKeywords` and `target` are caller-provided rules: an issue is a configured warning, not evidence by itself that a validator mishandles that keyword.

`compareSchema(schema, inputs, options)` accepts a non-empty array of raw input values or `{ name, input }` cases. It returns `conversionSucceeded`, counts, per-input validator results and errors, mismatches, and known unsupported-feature notes. Compilation and conversion errors are returned with a `conversionError.stage` and message; the CLI maps those failures to exit code 2. Invalid JavaScript arguments throw `TypeError`.

## Drafts and limits

Ajv is selected for JSON Schema draft-07 by default, draft 2019-09 when `$schema` names that dialect, and draft 2020-12 when it names that dialect. Other dialect identifiers are reported as compilation failures. Zod's `fromJSONSchema` importer defines the conversion behavior; it does not implement every JSON Schema feature or semantic detail. Schema constructs with unsupported or differing behavior may be ignored, rejected during conversion, or produce a disagreement. The report flags `$dynamicRef` and `$dynamicAnchor` as unsupported by the tested Zod importer and labels affected disagreements accordingly.

The comparison is empirical for the supplied schema and inputs only. Agreement on a finite set of cases does not prove general equivalence, and disagreement on a feature the target does not support should be treated as a compatibility finding, not as a universal claim about that validator.

The included `dynamic-ref` example records a reproduced disagreement with Ajv 8.20.0 and Zod 4.5.0: Ajv rejects a string at a recursively referenced numeric `value`, while Zod accepts it. The report also marks `$dynamicRef` as unsupported by Zod. Results can change with future dependency versions; rerun the fixture against the versions in your lockfile.

## Development

```sh
npm test
node src/cli.js --help
npm pack --dry-run
```

The package is distributed under the MIT License; see [LICENSE](LICENSE).
