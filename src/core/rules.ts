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
const FORMATS: Partial<Record<InputTypeName, { pattern: RegExp; message: string }>> = {
    email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: "Похоже, это не адрес почты",
    },
    tel: {
        // Намеренно широко: номера в мире записывают по-разному, и придираться
        // к скобкам и пробелам плагин не вправе.
        pattern: /^[+\d][\d\s()\-.]{4,}$/,
        message: "Похоже, это не номер телефона",
    },
};

function isEmpty(value: FieldValue | undefined): boolean {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "string") return value.trim() === "";
    return false;
}

function plural(count: number, one: string, few: string, many: string): string {
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 14) return many;
    const mod10 = count % 10;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
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
        return fail(format.message);
    }

    if (NUMERIC.includes(type)) {
        const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        if (!Number.isFinite(number)) return fail("Нужно число");
        if (rules.min !== undefined && number < rules.min) {
            return fail(`Не меньше ${rules.min}`);
        }
        if (rules.max !== undefined && number > rules.max) {
            return fail(`Не больше ${rules.max}`);
        }
    }

    if (COUNTABLE.includes(type)) {
        const count = Array.isArray(value) ? value.length : 1;
        if (rules.minLength !== undefined && count < rules.minLength) {
            const word = plural(rules.minLength, "значение", "значения", "значений");
            return fail(`Выберите хотя бы ${rules.minLength} ${word}`);
        }
        if (rules.maxLength !== undefined && count > rules.maxLength) {
            // После «не больше» существительное идёт в родительном падеже:
            // «не больше одного значения», «не больше трёх значений».
            const word = plural(rules.maxLength, "значения", "значений", "значений");
            return fail(`Не больше ${rules.maxLength} ${word}`);
        }
        return null;
    }

    if (TEXTUAL.includes(type)) {
        const text = String(value).trim();
        if (rules.minLength !== undefined && text.length < rules.minLength) {
            const word = plural(rules.minLength, "символа", "символов", "символов");
            return fail(`Не короче ${rules.minLength} ${word}`);
        }
        if (rules.maxLength !== undefined && text.length > rules.maxLength) {
            const word = plural(rules.maxLength, "символа", "символов", "символов");
            return fail(`Не длиннее ${rules.maxLength} ${word}`);
        }

        const regexp = compilePattern(rules.pattern);
        // Кривое выражение — не повод не пустить ответ дальше: про опечатку
        // скажет редактор поля, а заполняющий тут ни при чём.
        if (regexp !== null && !regexp.test(text)) {
            return fail("Значение не подходит под заданное правило");
        }
    }

    return null;
}

/** Осмысленны ли границы: минимум больше максимума — ошибка самой формы. */
export function checkRules(rules: FieldRules | undefined): string | null {
    if (!rules) return null;

    if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) {
        return "Минимум больше максимума";
    }
    if (
        rules.minLength !== undefined &&
        rules.maxLength !== undefined &&
        rules.minLength > rules.maxLength
    ) {
        return "Наименьшая длина больше наибольшей";
    }
    if (rules.minLength !== undefined && rules.minLength < 0) return "Длина не бывает отрицательной";
    if (rules.pattern !== undefined && compilePattern(rules.pattern) === null) {
        return "Выражение не разбирается";
    }
    return null;
}
