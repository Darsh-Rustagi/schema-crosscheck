
const SCHEMA_MAP_KEYWORDS = [
    "$defs",
    "definitions",
    "properties",
    "patternProperties",
    "dependentSchemas"
];

const SCHEMA_SINGLE_KEYWORDS = [
    "additionalProperties",
    "unevaluatedProperties",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
    "contains",
    "contentSchema",
    "additionalItems",
    "unevaluatedItems"
];

const SCHEMA_ARRAY_KEYWORDS = [
    "allOf",
    "anyOf",
    "oneOf",
    "prefixItems"
];

function escapePointerSegment(segment) {
    return String(segment)
        .replace(/~/g, "~0")
        .replace(/\//g, "~1");
}

export function checkSchema(schema, options = {}) {
    const {
        unsupportedKeywords = [],
        target = "target validator"
    } = options;

    if (
        typeof schema !== "object" ||
        schema === null ||
        Array.isArray(schema)
    ) {
        if (typeof schema !== "boolean") {
            throw new TypeError(
                "Schema must be a JSON Schema object or boolean."
            );
        }
    }

    const unsupported = new Set(unsupportedKeywords);
    const issues = [];

    function visit(current, path) {

        if (typeof current === "boolean") {
            return;
        }

        if (
            current === null ||
            typeof current !== "object" ||
            Array.isArray(current)
        ) {
            return;
        }


        for (const keyword of unsupported) {
            if (Object.hasOwn(current, keyword)) {
                issues.push({
                    keyword,
                    path: `${path}/${escapePointerSegment(keyword)}`,
                    target,
                    message:
                        `"${keyword}" may not be supported by ${target}.`
                });
            }
        }

        // Visit keywords whose values are maps of schemas.
        for (const keyword of SCHEMA_MAP_KEYWORDS) {
            const children = current[keyword];

            if (
                children === null ||
                typeof children !== "object" ||
                Array.isArray(children)
            ) {
                continue;
            }

            for (const [name, childSchema] of Object.entries(children)) {
                visit(
                    childSchema,
                    `${path}/${keyword}/${escapePointerSegment(name)}`
                );
            }
        }

        for (const keyword of SCHEMA_SINGLE_KEYWORDS) {
            if (Object.hasOwn(current, keyword)) {
                const child = current[keyword];

                if (
                    typeof child === "boolean" ||
                    (child !== null &&
                        typeof child === "object" &&
                        !Array.isArray(child))
                ) {
                    visit(
                        child,
                        `${path}/${keyword}`
                    );
                }
            }
        }

        if (Object.hasOwn(current, "items")) {
            const items = current.items;

            if (Array.isArray(items)) {
                items.forEach((child, index) => {
                    visit(child, `${path}/items/${index}`);
                });
            } else {
                visit(items, `${path}/items`);
            }
        }

        for (const keyword of SCHEMA_ARRAY_KEYWORDS) {
            const children = current[keyword];

            if (!Array.isArray(children)) {
                continue;
            }

            children.forEach((child, index) => {
                visit(child, `${path}/${keyword}/${index}`);
            });
        }

        if (
            current.dependencies !== null &&
            typeof current.dependencies === "object" &&
            !Array.isArray(current.dependencies)
        ) {
            for (const [name, dependency] of Object.entries(
                current.dependencies
            )) {
                if (
                    typeof dependency === "boolean" ||
                    (
                        dependency !== null &&
                        typeof dependency === "object" &&
                        !Array.isArray(dependency)
                    )
                ) {
                    visit(
                        dependency,
                        `${path}/dependencies/${escapePointerSegment(name)}`
                    );
                }
            }
        }
    }

    visit(schema, "");

    return issues;
}
