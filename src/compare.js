import Ajv from "ajv";
import Ajv2019 from "ajv/dist/2019.js";
import Ajv2020 from "ajv/dist/2020.js";
import * as z from "zod";
import { visitSchemas } from "./check.js";

function createAjv(schema) {
    const dialect = schema && typeof schema === "object" ? schema.$schema : "";
    const options = { allErrors: true, strict: false };
    if (typeof dialect === "string" && dialect.includes("2020-12")) return new Ajv2020(options);
    if (typeof dialect === "string" && dialect.includes("2019-09")) return new Ajv2019(options);
    if (!dialect || dialect.includes("draft-07") || dialect.includes("draft/7")) return new Ajv(options);
    throw new Error(`Unsupported JSON Schema dialect: ${dialect}`);
}

function normalizeCases(inputs) {
    if (!Array.isArray(inputs) || inputs.length === 0) {
        throw new TypeError("inputs must be a non-empty array.");
    }
    return inputs.map((item, index) => {
        if (item && typeof item === "object" && !Array.isArray(item) && Object.hasOwn(item, "input")) {
            if (item.name !== undefined && typeof item.name !== "string") {
                throw new TypeError(`inputs[${index}].name must be a string.`);
            }
            return { index, name: item.name ?? `input ${index + 1}`, input: item.input };
        }
        return { index, name: `input ${index + 1}`, input: item };
    });
}

function summarizeZodError(error) {
    return error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

export function compareSchema(schema, inputs, options = {}) {
    if (!(typeof schema === "boolean" || (typeof schema === "object" && schema !== null && !Array.isArray(schema)))) {
        throw new TypeError("Schema must be a JSON Schema object or boolean.");
    }
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError("Options must be an object.");
    }
    const cases = normalizeCases(inputs);
    let validate;
    let zodSchema;
    let validator;
    try {
        validator = createAjv(schema);
        validate = validator.compile(schema);
    } catch (error) {
        return {
            conversionSucceeded: false,
            totalInputs: cases.length,
            agreements: 0,
            mismatchCount: 0,
            results: [],
            mismatches: [],
            conversionError: { stage: "ajv-compilation", message: error.message }
        };
    }
    try {
        zodSchema = z.fromJSONSchema(schema, options.zod ?? {});
    } catch (error) {
        return {
            conversionSucceeded: false,
            totalInputs: cases.length,
            agreements: 0,
            mismatchCount: 0,
            results: [],
            mismatches: [],
            conversionError: { stage: "zod-conversion", message: error.message }
        };
    }

    const unsupportedFeatures = [];
    visitSchemas(schema, (current, path) => {
        for (const keyword of ["$dynamicRef", "$dynamicAnchor"]) {
            if (Object.hasOwn(current, keyword)) unsupportedFeatures.push({
                validator: "Zod", keyword,
                path: `${path}/${keyword}`,
                message: `Zod's JSON Schema importer does not implement ${keyword}; results involving this feature are observed behavior, not supported conversion.`
            });
        }
    });

    const results = cases.map(({ index, name, input }) => {
        const ajvAccepts = Boolean(validate(input));
        const ajvErrors = validate.errors ? validate.errors.map((error) => ({
            instancePath: error.instancePath,
            schemaPath: error.schemaPath,
            keyword: error.keyword,
            message: error.message,
            params: error.params
        })) : [];
        const zodResult = zodSchema.safeParse(input);
        const zodAccepts = zodResult.success;
        return {
            index, name, input,
            ajv: { accepts: ajvAccepts, errors: ajvErrors },
            zod: { accepts: zodAccepts, errors: zodAccepts ? [] : summarizeZodError(zodResult.error) },
            agrees: ajvAccepts === zodAccepts
        };
    });
    const mismatches = results.filter((result) => !result.agrees).map((result) => ({
        ...result,
        classification: unsupportedFeatures.length ? "unsupported-feature" : "observed-mismatch"
    }));
    return {
        conversionSucceeded: true,
        totalInputs: cases.length,
        agreements: results.length - mismatches.length,
        mismatchCount: mismatches.length,
        results,
        mismatches,
        unsupportedFeatures
    };
}
