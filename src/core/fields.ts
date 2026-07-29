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
    source: "fixed" | "notes",
): InputType {
    if (type === "select") {
        return source === "notes"
            ? { type: "select", source: "notes", folder: "" }
            : { type: "select", source: "fixed", options: [] };
    }
    return source === "notes"
        ? { type: "multiselect", source: "notes", folder: "" }
        : { type: "multiselect", source: "fixed", options: [] };
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
        case "text":
        case "textarea":
        case "number":
        case "toggle":
        case "date":
        case "time":
        case "datetime":
        case "tag":
        case "folder":
        case "image":
        case "file":
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

    const input = field.input;
    if (input.type === "select" || input.type === "multiselect") {
        if (input.source === "fixed" && input.options.length === 0) {
            return "Не задан ни один вариант выбора";
        }
        if (input.source === "notes" && input.folder.trim() === "") {
            return "Не указана папка с заметками";
        }
    }
    if (input.type === "note" && input.folder.trim() === "") {
        return "Не указана папка с заметками";
    }
    if (input.type === "slider") {
        if (input.min >= input.max) return "Минимум ползунка должен быть меньше максимума";
        if (input.step <= 0) return "Шаг ползунка должен быть больше нуля";
        if (input.step > input.max - input.min) return "Шаг больше всего диапазона";
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
