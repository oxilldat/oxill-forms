import { t, tp } from "../i18n";
import type { TranslationKey } from "../i18n";
import { compilePattern } from "./patterns";
import type { FieldValue } from "./FormResult";
import type { FieldDefinition, FieldRules, InputTypeName } from "./types";

/**
 * Проверка ответа пользователя. Отдельно от `validateField` из fields.ts: там
 * проверяется, что форма собрана правильно, а здесь — что человек её правильно
 * заполнил. Первое видит автор формы, второе — тот, кто её заполняет.
 *
 * Пустой ответ здесь всегда годится: за «ответ вообще есть» отвечает
 * `required`, и удваивать это сообщение не нужно.
 */

/** Типы, у которых проверяется число. */
const NUMERIC: InputTypeName[] = ["number", "slider"];

/** Типы, у которых проверяется длина текста. */
const TEXTUAL: InputTypeName[] = ["text", "textarea", "email", "tel"];

/** Типы, у которых проверяется количество выбранного. */
const COUNTABLE: InputTypeName[] = ["multiselect", "tag"];

/** Какие правила имеют смысл для типа. По этому же списку рисуется редактор. */
export function rulesFor(type: InputTypeName): (keyof FieldRules)[] {
    if (NUMERIC.includes(type)) return ["min", "max", "message"];
    if (TEXTUAL.includes(type)) return ["minLength", "maxLength", "pattern", "message"];
    if (COUNTABLE.includes(type)) return ["minLength", "maxLength", "message"];
    return [];
}

export function hasRules(type: InputTypeName): boolean {
    return rulesFor(type).length > 0;
}

/** Простая проверка формата — по типу поля, без всяких настроек. */
const FORMATS: Partial<Record<InputTypeName, { pattern: RegExp; message: TranslationKey }>> = {
    email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: "rules.email",
    },
    tel: {
        // Намеренно широко: номера в мире записывают по-разному, и придираться
        // к скобкам и пробелам плагин не вправе.
        pattern: /^[+\d][\d\s()\-.]{4,}$/,
        message: "rules.tel",
    },
};

function isEmpty(value: FieldValue | undefined): boolean {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "string") return value.trim() === "";
    return false;
}

/**
 * Проверяет ответ и возвращает сообщение об ошибке или `null`.
 *
 * Своё сообщение перекрывает любое сгенерированное: если автор формы взял на
 * себя труд объяснить правило словами, значит, его объяснение лучше нашего.
 */
export function checkValue(field: FieldDefinition, value: FieldValue | undefined): string | null {
    if (isEmpty(value)) return null;

    const type = field.input.type;
    const rules = field.rules ?? {};
    const custom = rules.message?.trim();
    const fail = (generated: string): string => (custom === undefined || custom === "" ? generated : custom);

    const format = FORMATS[type];
    if (format && typeof value === "string" && !format.pattern.test(value.trim())) {
        return fail(t(format.message));
    }

    if (NUMERIC.includes(type)) {
        const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        if (!Number.isFinite(number)) return fail(t("rules.number"));
        if (rules.min !== undefined && number < rules.min) {
            return fail(t("rules.min", { min: rules.min }));
        }
        if (rules.max !== undefined && number > rules.max) {
            return fail(t("rules.max", { max: rules.max }));
        }
    }

    if (COUNTABLE.includes(type)) {
        const count = Array.isArray(value) ? value.length : 1;
        if (rules.minLength !== undefined && count < rules.minLength) {
            return fail(tp("rules.minCount", rules.minLength));
        }
        if (rules.maxLength !== undefined && count > rules.maxLength) {
            return fail(tp("rules.maxCount", rules.maxLength));
        }
        return null;
    }

    if (TEXTUAL.includes(type)) {
        const text = String(value).trim();
        if (rules.minLength !== undefined && text.length < rules.minLength) {
            return fail(tp("rules.minLength", rules.minLength));
        }
        if (rules.maxLength !== undefined && text.length > rules.maxLength) {
            return fail(tp("rules.maxLength", rules.maxLength));
        }

        const regexp = compilePattern(rules.pattern);
        // Кривое выражение — не повод не пустить ответ дальше: про опечатку
        // скажет редактор поля, а заполняющий тут ни при чём.
        if (regexp !== null && !regexp.test(text)) {
            return fail(t("rules.pattern"));
        }
    }

    return null;
}

/** Осмысленны ли границы: минимум больше максимума — ошибка самой формы. */
export function checkRules(rules: FieldRules | undefined): string | null {
    if (!rules) return null;

    if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) {
        return t("rules.badRange");
    }
    if (
        rules.minLength !== undefined &&
        rules.maxLength !== undefined &&
        rules.minLength > rules.maxLength
    ) {
        return t("rules.badLength");
    }
    if (rules.minLength !== undefined && rules.minLength < 0) return t("rules.negativeLength");
    if (rules.pattern !== undefined && compilePattern(rules.pattern) === null) {
        return t("rules.badPattern");
    }
    return null;
}
