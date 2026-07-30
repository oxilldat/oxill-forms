import type { FieldValue } from "./FormResult";

/**
 * Преобразования значений в шаблоне: `{{ title | upper }}`.
 * Список закрытый: имя из шаблона, которого здесь нет, считается опечаткой.
 */
export const TRANSFORMS = [
    "upper",
    "lower",
    "trim",
    "capitalize",
    "slug",
    "snake",
    "link",
    "list",
] as const;

export type TransformName = (typeof TRANSFORMS)[number];

export function isTransformName(value: string): value is TransformName {
    return (TRANSFORMS as readonly string[]).includes(value);
}

/** Значение одной строкой: массивы склеиваем запятой. */
function asText(value: FieldValue): string {
    return Array.isArray(value) ? value.join(", ") : String(value);
}

/**
 * Строка, пригодная для имени файла и ссылки: нижний регистр, дефисы вместо
 * пробелов. Буквы любых алфавитов сохраняются, поэтому кириллица не пропадает.
 */
export function toSlug(value: string): string {
    return value
        .toLocaleLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^\p{L}\p{N}-]+/gu, "")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** То же, но с подчёркиваниями — годится для ключа YAML или имени переменной. */
export function toSnake(value: string): string {
    return value
        .toLocaleLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/[^\p{L}\p{N}_]+/gu, "")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function capitalize(value: string): string {
    return value === "" ? value : value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

/**
 * Применяет преобразование к значению. Для массивов преобразования, меняющие
 * отдельные слова, применяются к каждому элементу — иначе `slug` склеил бы
 * список в одну кашу.
 */
export function applyTransform(name: TransformName, value: FieldValue): string {
    const items = Array.isArray(value) ? value : [value];
    const perItem = (fn: (text: string) => string): string =>
        items.map((item) => fn(String(item))).join(", ");

    switch (name) {
        case "upper":
            return asText(value).toLocaleUpperCase();
        case "lower":
            return asText(value).toLocaleLowerCase();
        case "trim":
            return asText(value).trim();
        case "capitalize":
            return perItem(capitalize);
        case "slug":
            return perItem(toSlug);
        case "snake":
            return perItem(toSnake);
        case "link":
            // Уже готовую ссылку из полей image и file второй раз не оборачиваем.
            return perItem((text) => (/^\[\[.*]]$/.test(text) ? text : `[[${text}]]`));
        case "list":
            return items.map((item) => `- ${String(item)}`).join("\n");
    }
}
