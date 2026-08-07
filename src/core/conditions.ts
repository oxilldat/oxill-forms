import type { FieldValue } from "./FormResult";
import type {
    ConditionKind,
    FieldCondition,
    InputType,
    InputTypeName,
    SelectOption,
} from "./types";

/** Подписи для выпадающего списка в редакторе поля. */
/** Условиям без значения поле ввода не нужно. */
export function conditionNeedsValue(kind: ConditionKind): boolean {
    return kind !== "isSet" && kind !== "isTrue" && kind !== "isFalse";
}

/** Какие условия имеют смысл для поля-зависимости данного типа. */
export function conditionsFor(type: InputTypeName): ConditionKind[] {
    switch (type) {
        case "toggle":
            return ["isTrue", "isFalse"];
        case "number":
        case "slider":
            return ["isSet", "equals", "above", "below"];
        case "date":
        case "time":
        case "datetime":
            // Даты в формате ISO сравниваются как строки в правильном порядке.
            return ["isSet", "equals", "above", "below"];
        case "multiselect":
        case "tag":
            return ["isSet", "contains"];
        case "image":
        case "file":
            return ["isSet"];
        case "section":
            // Раздел не хранит значения, зависеть от него не от чего.
            return [];
        case "text":
        case "textarea":
        case "email":
        case "tel":
        case "select":
        case "dataview":
        case "note":
        case "folder":
            return ["isSet", "equals", "contains", "startsWith", "endsWith"];
    }
}

/**
 * Чем спрашивать значение условия. Ввод должен повторять то поле, на которое
 * условие смотрит: список — списком, дату — календарём. Иначе человек угадывает
 * и формат, и написание варианта, а ошибётся — условие просто молча не
 * сработает.
 */
export type ConditionValueInput =
    | { kind: "options"; options: SelectOption[] }
    | { kind: "number" }
    | { kind: "date" }
    | { kind: "time" }
    | { kind: "datetime" }
    | { kind: "note"; folder: string }
    | { kind: "folder"; parent?: string }
    | { kind: "text" };

/**
 * Условия, сравнивающие значение целиком. «Начинается с» и «заканчивается на»
 * смотрят на кусок строки — выбирать там из готовых вариантов нечего, поэтому
 * им всегда достаётся свободный текст.
 */
function comparesWholeValue(kind: ConditionKind): boolean {
    return kind !== "startsWith" && kind !== "endsWith";
}

export function conditionValueInput(input: InputType, kind: ConditionKind): ConditionValueInput {
    if (input.type === "number" || input.type === "slider") return { kind: "number" };

    if (!comparesWholeValue(kind)) return { kind: "text" };

    switch (input.type) {
        case "select":
        case "multiselect":
            // Варианты известны только у списка, набранного руками. У списка из
            // заметок или запроса Dataview они зависят от хранилища, а его в
            // редакторе поля нет.
            return input.source === "fixed"
                ? { kind: "options", options: input.options }
                : { kind: "text" };
        case "date":
            return { kind: "date" };
        case "time":
            return { kind: "time" };
        case "datetime":
            return { kind: "datetime" };
        case "note":
            return { kind: "note", folder: input.folder };
        case "folder":
            return { kind: "folder", parent: input.parent };
        default:
            return { kind: "text" };
    }
}

/**
 * Годится ли уже введённое значение новому полю-зависимости. Проверяем только
 * там, где набор значений закрыт: сохранённый вариант из прежнего списка в
 * новом обычно отсутствует, и условие не сработает никогда — а по виду формы
 * этого не понять.
 */
export function conditionValueFits(
    input: InputType,
    kind: ConditionKind,
    value: string | number | undefined,
): boolean {
    if (value === undefined || value === "") return false;

    const wanted = conditionValueInput(input, kind);
    if (wanted.kind === "options") {
        return wanted.options.some((option) => option.value === String(value));
    }
    if (wanted.kind === "number") return Number.isFinite(Number(value));
    return true;
}

function isBlank(value: FieldValue | undefined): boolean {
    if (value === undefined || value === "") return true;
    return Array.isArray(value) && value.length === 0;
}

function asText(value: FieldValue | undefined): string {
    if (value === undefined) return "";
    return Array.isArray(value) ? value.join(", ") : String(value);
}

/**
 * Сравнение по порядку. Если оба значения похожи на числа — сравниваем как
 * числа, иначе как строки. За счёт второго работают даты вида 2026-07-30.
 */
function compare(value: FieldValue | undefined, expected: string | number | undefined): number {
    const left = asText(value);
    const right = String(expected ?? "");

    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (left !== "" && right !== "" && !isNaN(leftNumber) && !isNaN(rightNumber)) {
        return leftNumber - rightNumber;
    }
    return left.localeCompare(right);
}

/** Выполнено ли условие при таком значении поля-зависимости. */
export function conditionMet(condition: FieldCondition, value: FieldValue | undefined): boolean {
    const expected = String(condition.value ?? "");

    switch (condition.kind) {
        case "isSet":
            return !isBlank(value);
        case "isTrue":
            return value === true;
        case "isFalse":
            return value === false;
        case "equals":
            // Для списка «равно» означает «есть среди выбранного».
            return Array.isArray(value) ? value.includes(expected) : asText(value) === expected;
        case "contains":
            return Array.isArray(value)
                ? value.includes(expected)
                : asText(value).includes(expected);
        case "startsWith":
            return asText(value).startsWith(expected);
        case "endsWith":
            return asText(value).endsWith(expected);
        case "above":
            return !isBlank(value) && compare(value, condition.value) > 0;
        case "below":
            return !isBlank(value) && compare(value, condition.value) < 0;
    }
}
