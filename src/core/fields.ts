import { t } from "../i18n";
import { isDecorative } from "./types";
import { freeNameFrom, isValidName } from "./naming";
import type { FieldDefinition, InputType, InputTypeName } from "./types";

/** Заготовка поля при добавлении: текстовое, с уникальным именем. */
export function createField(existing: FieldDefinition[]): FieldDefinition {
    const name = freeNameFrom((candidate) => isFieldNameTaken(existing, candidate), "field");
    return { name, label: "", description: "", input: { type: "text" } };
}

export function isFieldNameTaken(
    fields: FieldDefinition[],
    name: string,
    exceptField?: FieldDefinition,
): boolean {
    return fields.some((field) => field.name === name && field !== exceptField);
}

/**
 * Пересобирает выбор при смене источника. Отдельная функция нужна из-за
 * типов: `{ type: kind }` с union-литералом в kind не подходит под InputType.
 */
export function withSource(
    type: "select" | "multiselect",
    source: "fixed" | "notes" | "dataview",
): InputType {
    if (type === "select") {
        // У одиночного выбора запроса как источника нет: для него есть
        // отдельный тип «dataview», и второй способ сделать то же самое
        // только запутал бы список типов.
        return source === "notes"
            ? { type: "select", source: "notes", folder: "" }
            : { type: "select", source: "fixed", options: [] };
    }
    if (source === "notes") return { type: "multiselect", source: "notes", folder: "" };
    if (source === "dataview") return { type: "multiselect", source: "dataview", query: "" };
    return { type: "multiselect", source: "fixed", options: [] };
}

/** Значения по умолчанию для каждого типа при переключении в редакторе. */
export function defaultInputFor(type: InputTypeName): InputType {
    switch (type) {
        case "select":
            return { type: "select", source: "fixed", options: [] };
        case "multiselect":
            return { type: "multiselect", source: "fixed", options: [] };
        case "note":
            return { type: "note", folder: "" };
        case "slider":
            return { type: "slider", min: 0, max: 10, step: 1 };
        case "dataview":
            return { type: "dataview", query: "" };
        case "text":
        case "textarea":
        case "email":
        case "tel":
        case "number":
        case "toggle":
        case "date":
        case "time":
        case "datetime":
        case "tag":
        case "folder":
        case "image":
        case "file":
        case "section":
            return { type };
    }
}

/**
 * Копия поля рядом с оригиналом. Имя подбирается по тем же правилам, что при
 * создании: два поля с одним ключом — это одно значение в результате.
 */
export function duplicateField(fields: FieldDefinition[], index: number): FieldDefinition[] {
    const source = fields[index];
    if (!source) return fields;

    const copy: FieldDefinition = {
        ...structuredClone(source),
        name: freeNameFrom((candidate) => isFieldNameTaken(fields, candidate), source.name),
    };

    const next = [...fields];
    next.splice(index + 1, 0, copy);
    return next;
}

/**
 * Переставляет поле на новое место. `to` — позиция в списке ДО изъятия поля,
 * то есть номер строки, перед которой его бросили.
 */
export function reorderField(
    fields: FieldDefinition[],
    from: number,
    to: number,
): FieldDefinition[] {
    if (from < 0 || from >= fields.length) return fields;
    if (to < 0 || to > fields.length) return fields;
    // Бросок на своё же место и сразу под себя ничего не меняет.
    if (to === from || to === from + 1) return fields;

    const next = [...fields];
    const [moved] = next.splice(from, 1);
    if (!moved) return fields;

    next.splice(to > from ? to - 1 : to, 0, moved);
    return next;
}

/** Перемещает поле на `delta` позиций. Выход за границы списка игнорируется. */
export function moveField(
    fields: FieldDefinition[],
    index: number,
    delta: number,
): FieldDefinition[] {
    const target = index + delta;
    if (index < 0 || index >= fields.length || target < 0 || target >= fields.length) {
        return fields;
    }
    const next = [...fields];
    const [moved] = next.splice(index, 1);
    if (!moved) return fields;
    next.splice(target, 0, moved);
    return next;
}

export function removeFieldAt(fields: FieldDefinition[], index: number): FieldDefinition[] {
    return fields.filter((_, i) => i !== index);
}

/**
 * Проверяет одно поле. `others` — остальные поля формы, нужны для контроля
 * уникальности имени. Возвращает текст ошибки или null.
 */
export function validateField(field: FieldDefinition, others: FieldDefinition[]): string | null {
    const name = field.name.trim();
    if (name === "") return t("check.nameEmpty");
    if (!isValidName(name)) return t("check.nameLatin");
    if (isFieldNameTaken(others, name)) return t("check.nameTaken");

    const input = field.input;
    if (input.type === "select" || input.type === "multiselect") {
        if (input.source === "fixed" && input.options.length === 0) {
            return t("check.noOptions");
        }
        if (input.source === "notes" && input.folder.trim() === "") {
            return t("check.noFolder");
        }
    }
    if (input.type === "note" && input.folder.trim() === "") {
        return t("check.noFolder");
    }
    if (input.type === "dataview" && input.query.trim() === "") {
        return t("check.noQuery");
    }
    if (input.type === "slider") {
        if (input.min >= input.max) return t("check.sliderRange");
        if (input.step <= 0) return t("check.sliderStep");
        if (input.step > input.max - input.min) return t("check.sliderStepBig");
    }

    // Раздел — просто заголовок: он ничего не спрашивает и ничего не возвращает.
    if (isDecorative(input.type)) {
        if (field.required) return t("check.sectionRequired");
        if (field.hidden) return t("check.sectionHidden");
        if ((field.label ?? "").trim() === "") return t("check.sectionLabel");
    }

    // Скрытое поле пользователь не заполнит, поэтому обязательным быть не может.
    if (field.hidden && field.required) {
        return t("check.hiddenRequired");
    }
    if (field.hidden && field.condition) {
        return t("check.hiddenCondition");
    }

    if (field.condition) {
        const dependencyName = field.condition.field;
        if (dependencyName === name) return t("check.selfCondition");
        if (!others.some((other) => other.name === dependencyName)) {
            return t("check.missingDependency", { name: dependencyName });
        }
    }

    return null;
}

/**
 * Страховка на сохранении всей формы: поля проверяются по одному ещё в своём
 * окне, но данные могли приехать из отредактированного руками data.json.
 */
export function validateFields(fields: FieldDefinition[]): string | null {
    for (const field of fields) {
        const others = fields.filter((other) => other !== field);
        const error = validateField(field, others);
        if (error) return t("check.fieldPrefix", { name: field.name || t("check.unnamed"), error });
    }
    return null;
}
