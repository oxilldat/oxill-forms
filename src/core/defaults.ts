import { resolveDateTokens } from "./dates";
import type { FieldValue, FormData } from "./FormResult";
import type { FieldDefinition, InputTypeName } from "./types";

/**
 * Значения, которыми поля заполнены при открытии формы. Именно из-за них
 * заполнение становится полуавтоматическим: сегодняшнюю дату и обычную папку
 * подставляет плагин, а человек правит только то, что отличается.
 */

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
        const value = coerce(resolveDateTokens(raw, now), field.input.type);
        if (value !== undefined) values[field.name] = value;
    }
    return values;
}
