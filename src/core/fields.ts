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

/** Значения по умолчанию для каждого типа при переключении в редакторе. */
export function defaultInputFor(type: InputTypeName): InputType {
    switch (type) {
        case "select":
            return { type: "select", options: [] };
        case "note":
            return { type: "note", folder: "" };
        case "text":
        case "textarea":
        case "number":
        case "date":
        case "toggle":
        case "folder":
            return { type };
    }
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
    if (name === "") return "Идентификатор не может быть пустым";
    if (!isValidName(name)) return "Идентификатор — только латинские буквы";
    if (isFieldNameTaken(others, name)) return "Такой идентификатор в форме уже есть";

    if (field.input.type === "select" && field.input.options.length === 0) {
        return "Не задан ни один вариант выбора";
    }
    if (field.input.type === "note" && field.input.folder.trim() === "") {
        return "Не указана папка с заметками";
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
        if (error) return `Поле «${field.name || "без имени"}»: ${error}`;
    }
    return null;
}
