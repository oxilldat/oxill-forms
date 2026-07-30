import type { FieldValue, FormData } from "./FormResult";
import type { FieldDefinition, InputTypeName } from "./types";

/**
 * Начальные значения формы из шапки уже существующей заметки. Благодаря
 * этому форма открывается заполненной, и правишь одно поле, а не все девять.
 *
 * Берём только те ключи, чьи имена совпадают с полями формы. Всё остальное в
 * шапке заметки нас не касается и остаётся нетронутым.
 */
export function valuesFromFrontmatter(
    fields: FieldDefinition[],
    frontmatter: Record<string, unknown> | undefined,
): Partial<FormData> {
    if (!frontmatter) return {};

    const values: Partial<FormData> = {};
    for (const field of fields) {
        if (!(field.name in frontmatter)) continue;
        const coerced = coerce(frontmatter[field.name], field.input.type);
        if (coerced !== undefined) values[field.name] = coerced;
    }
    return values;
}

/** Приводит значение из YAML к тому виду, который ждёт поле этого типа. */
function coerce(raw: unknown, type: InputTypeName): FieldValue | undefined {
    if (raw === null || raw === undefined) return undefined;

    switch (type) {
        case "multiselect":
        case "tag":
            // Одиночное значение в шапке — тоже список, просто из одного.
            return Array.isArray(raw)
                ? raw.map((item) => String(item))
                : [asText(raw)];

        case "toggle":
            if (typeof raw === "boolean") return raw;
            // Obsidian хранит галочки как true/false, но руками могли вписать текст.
            return asText(raw).toLowerCase() === "true";

        case "number":
        case "slider": {
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : undefined;
        }

        default: {
            const text = asText(raw);
            return text === "" ? undefined : text;
        }
    }
}

/**
 * Значение из YAML одной строкой. Даты Obsidian отдаёт объектом Date —
 * приводим к тому же виду, что показывает поле даты.
 */
function asText(raw: unknown): string {
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    if (Array.isArray(raw)) return raw.map((item) => String(item)).join(", ");
    if (typeof raw === "object") return "";
    return String(raw);
}
