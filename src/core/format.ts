import type { FieldSelection, FormData } from "./FormResult";
import { applyTransform, flatten, isTransformName } from "./transform";

/**
 * Сборка текста из собранных данных. Здесь нет ничего от Obsidian — только
 * строки, поэтому логику вывода можно проверять тестами без запуска приложения.
 */

/**
 * Отбор полей. Набор полей формы и набор полей заметки не совпадают:
 * служебные поля нужны для работы, но в тексте заметки им не место.
 */
export function selectFields(data: FormData, selection?: FieldSelection): FormData {
    let entries = Object.entries(data);
    if (selection?.pick) {
        const pick = selection.pick;
        entries = entries.filter(([key]) => pick.includes(key));
    }
    if (selection?.omit) {
        const omit = selection.omit;
        entries = entries.filter(([key]) => !omit.includes(key));
    }
    return Object.fromEntries(entries);
}

/** Inline-свойства Dataview: `ключ:: значение`. */
export function asDataviewText(data: FormData): string {
    return Object.entries(data)
        .map(([key, value]) => `${key}:: ${flatten(value)}`)
        .join("\n");
}

/** Маркированный список. */
export function asListText(data: FormData): string {
    return Object.entries(data)
        .map(([key, value]) => `- ${key}: ${flatten(value)}`)
        .join("\n");
}

/**
 * Подстановка в шаблон: `{{ ключ }}` или `{{ ключ | преобразование }}`.
 * Неизвестный ключ и неизвестное преобразование оставляют шаблон нетронутым —
 * так опечатка сразу видна в тексте, а не превращается в пустое место.
 */
/** Метка места курсора в шаблоне. Из готового текста вырезается. */
export const CURSOR_TOKEN = /\{\{\s*cursor\s*\}\}/;

export interface RenderedNote {
    text: string;
    /** Смещение курсора от начала текста, если в шаблоне была метка. */
    cursor?: number;
}

/**
 * Шаблон заметки. Кроме обычных полей понимает две особые подстановки:
 * `{{frontmatter}}` — вся шапка YAML разом, чтобы не перечислять поля
 * руками, и `{{cursor}}` — куда встанет курсор после вставки.
 */
export function renderNote(
    template: string,
    data: FormData,
    frontmatter: string,
): RenderedNote {
    const withFrontmatter = template.replace(/\{\{\s*frontmatter\s*\}\}/g, frontmatter);
    const rendered = renderTemplate(withFrontmatter, data);

    const match = CURSOR_TOKEN.exec(rendered);
    if (!match) return { text: rendered };

    return {
        text: rendered.replace(CURSOR_TOKEN, ""),
        cursor: match.index,
    };
}

export function renderTemplate(template: string, data: FormData): string {
    return template.replace(
        /\{\{\s*(\w+)\s*(?:\|\s*(\w+)\s*)?\}\}/g,
        (match, key: string, transform?: string) => {
            const value = data[key];
            if (value === undefined) return match;
            if (transform === undefined) return flatten(value);
            if (!isTransformName(transform)) return match;
            return applyTransform(transform, value);
        },
    );
}
