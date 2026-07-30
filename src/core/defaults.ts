import type { FieldValue, FormData } from "./FormResult";
import type { FieldDefinition, InputTypeName } from "./types";

/**
 * Значения, которыми поля заполнены при открытии формы. Именно из-за них
 * заполнение становится полуавтоматическим: сегодняшнюю дату и обычную папку
 * подставляет плагин, а человек правит только то, что отличается.
 */

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

export function formatDate(now: Date): string {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatTime(now: Date): string {
    return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Подстановки в значении по умолчанию. Список закрытый: это не шаблон
 * заметки, а одна строка, и вычислять здесь нечего.
 */
export function resolveTokens(text: string, now: Date): string {
    return text
        .replace(/\{\{\s*today\s*\}\}/g, formatDate(now))
        .replace(/\{\{\s*now\s*\}\}/g, formatTime(now))
        .replace(/\{\{\s*datetime\s*\}\}/g, `${formatDate(now)}T${formatTime(now)}`);
}

/** Приводит строку из настройки к тому виду, который ждёт поле этого типа. */
function coerce(text: string, type: InputTypeName): FieldValue | undefined {
    if (text === "") return undefined;

    switch (type) {
        case "multiselect":
        case "tag":
            // Несколько значений по умолчанию перечисляются запятой.
            return text
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item !== "");

        case "toggle":
            return text.toLowerCase() === "true";

        case "number":
        case "slider": {
            const parsed = Number(text);
            return Number.isFinite(parsed) ? parsed : undefined;
        }

        default:
            return text;
    }
}

export function defaultValues(fields: FieldDefinition[], now = new Date()): Partial<FormData> {
    const values: Partial<FormData> = {};
    for (const field of fields) {
        const raw = field.default?.trim();
        if (!raw) continue;
        const value = coerce(resolveTokens(raw, now), field.input.type);
        if (value !== undefined) values[field.name] = value;
    }
    return values;
}
