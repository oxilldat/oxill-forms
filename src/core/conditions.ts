import type { FieldValue } from "./FormResult";
import type { ConditionKind, FieldCondition, InputTypeName } from "./types";

/** Подписи для выпадающего списка в редакторе поля. */
export const CONDITION_LABELS: Record<ConditionKind, string> = {
    isSet: "заполнено",
    equals: "равно",
    contains: "содержит",
    startsWith: "начинается с",
    endsWith: "заканчивается на",
    above: "больше чем",
    below: "меньше чем",
    isTrue: "включено",
    isFalse: "выключено",
};

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
