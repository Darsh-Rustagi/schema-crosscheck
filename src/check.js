const SCHEMA_MAP_KEYWORDS = [
    "$defs", "definitions", "properties", "patternProperties",
    "dependentSchemas"
];
const SCHEMA_SINGLE_KEYWORDS = [
    "additionalProperties", "unevaluatedProperties", "propertyNames", "not",
    "if", "then", "else", "contains", "contentSchema", "additionalItems",
    "unevaluatedItems"
];
const SCHEMA_ARRAY_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"];

export function escapePointerSegment(segment) {
    return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

export function visitSchemas(schema, callback) {
    const seen = new WeakSet();
    function visit(current, path) {
        if (typeof current !== "object" || current === null || Array.isArray(current)) return;
        if (seen.has(current)) return;
        seen.add(current);
        callback(current, path);
        for (const keyword of SCHEMA_MAP_KEYWORDS) {
            const children = current[keyword];
            if (children && typeof children === "object" && !Array.isArray(children)) {
                for (const [name, child] of Object.entries(children)) {
                    visit(child, `${path}/${keyword}/${escapePointerSegment(name)}`);
                }
            }
        }
        for (const keyword of SCHEMA_SINGLE_KEYWORDS) {
            const child = current[keyword];
            if (Object.hasOwn(current, keyword) && (typeof child === "boolean" || (child && typeof child === "object" && !Array.isArray(child)))) {
                visit(child, `${path}/${keyword}`);
            }
        }
        if (Object.hasOwn(current, "items")) {
            const items = current.items;
            if (Array.isArray(items)) items.forEach((child, i) => visit(child, `${path}/items/${i}`));
            else if (typeof items === "boolean" || (items && typeof items === "object")) visit(items, `${path}/items`);
        }
        for (const keyword of SCHEMA_ARRAY_KEYWORDS) {
            const children = current[keyword];
            if (Array.isArray(children)) children.forEach((child, i) => visit(child, `${path}/${keyword}/${i}`));
        }
        const dependencies = current.dependencies;
        if (dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)) {
            for (const [name, child] of Object.entries(dependencies)) {
                if (typeof child === "boolean" || (child && typeof child === "object" && !Array.isArray(child))) {
                    visit(child, `${path}/dependencies/${escapePointerSegment(name)}`);
                }
            }
        }
    }
    if (typeof schema === "object" && schema !== null && !Array.isArray(schema)) visit(schema, "");
}

export function checkSchema(schema, options = {}) {
    if (!(typeof schema === "boolean" || (typeof schema === "object" && schema !== null && !Array.isArray(schema)))) {
        throw new TypeError("Schema must be a JSON Schema object or boolean.");
    }
    if (options === null || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError("Options must be an object.");
    }
    const { unsupportedKeywords = [], target = "target validator" } = options;
    if (!Array.isArray(unsupportedKeywords) || unsupportedKeywords.some((key) => typeof key !== "string" || key.length === 0)) {
        throw new TypeError("unsupportedKeywords must be an array of non-empty strings.");
    }
    if (typeof target !== "string" || !target.trim()) throw new TypeError("target must be a non-empty string.");
    const unsupported = new Set(unsupportedKeywords);
    const issues = [];
    visitSchemas(schema, (current, path) => {
        for (const keyword of unsupported) {
            if (Object.hasOwn(current, keyword)) {
                issues.push({
                    keyword,
                    path: `${path}/${escapePointerSegment(keyword)}`,
                    target,
                    message: `"${keyword}" may not be supported by ${target}.`
                });
            }
        }
    });
    return issues;
}
