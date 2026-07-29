/**
 * Модель данных плагина. Всё, что здесь описано, сериализуется в data.json,
 * поэтому менять эти типы можно только с оглядкой на уже сохранённые формы.
 */

/** Типы полей ввода, поддерживаемые на текущем этапе. */
export type InputType =
    | { type: "text" }
    | { type: "textarea" }
    | { type: "number" }
    | { type: "date" }
    | { type: "toggle" }
    | { type: "select"; options: SelectOption[] }
    | { type: "note"; folder: string }
    | { type: "folder" };

export type InputTypeName = InputType["type"];

export interface SelectOption {
    /** То, что попадёт в результат формы. */
    value: string;
    /** То, что видит пользователь в списке. */
    label: string;
}

export interface FieldDefinition {
    /** Ключ в результате формы. Уникален в пределах формы. */
    name: string;
    /** Подпись в интерфейсе. Если пустая — показываем name. */
    label?: string;
    description?: string;
    required?: boolean;
    input: InputType;
}

export interface FormDefinition {
    /** Уникальный идентификатор формы, по нему форма открывается из кода. */
    name: string;
    /** Заголовок модального окна. */
    title: string;
    fields: FieldDefinition[];
}

export interface PluginSettings {
    forms: FormDefinition[];
}

/** Человекочитаемые названия типов — для выпадающих списков в редакторе. */
export const INPUT_TYPE_LABELS: Record<InputTypeName, string> = {
    text: "Текст",
    textarea: "Многострочный текст",
    number: "Число",
    date: "Дата",
    toggle: "Переключатель",
    select: "Выбор из списка",
    note: "Заметка из папки",
    folder: "Папка",
};
