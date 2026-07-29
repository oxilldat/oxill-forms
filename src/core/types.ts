/**
 * Модель данных плагина. Всё, что здесь описано, сериализуется в data.json,
 * поэтому менять эти типы можно только с оглядкой на уже сохранённые формы.
 */

export interface SelectOption {
    /** То, что попадёт в результат формы. */
    value: string;
    /** То, что видит пользователь в списке. */
    label: string;
}

/**
 * Выпадающий список. Виджет один, а источник значений разный, поэтому
 * различаем не типом, а полем `source` — иначе типов расплодилось бы вдвое.
 */
export type SelectInput =
    | { type: "select"; source: "fixed"; options: SelectOption[] }
    | { type: "select"; source: "notes"; folder: string };

/** Множественный выбор. Источники те же, что у одиночного. */
export type MultiselectInput =
    | { type: "multiselect"; source: "fixed"; options: SelectOption[] }
    | { type: "multiselect"; source: "notes"; folder: string };

/** Типы, у которых значений может быть несколько. */
export type MultiValueTypeName = "multiselect" | "tag";

/** Типы полей ввода, поддерживаемые на текущем этапе. */
export type InputType =
    | { type: "text" }
    | { type: "textarea" }
    | { type: "number" }
    | { type: "slider"; min: number; max: number; step: number }
    | { type: "toggle" }
    | { type: "date" }
    | { type: "time" }
    | { type: "datetime" }
    | SelectInput
    | MultiselectInput
    | { type: "tag" }
    | { type: "dataview"; query: string }
    | { type: "note"; folder: string }
    | { type: "folder" }
    | { type: "image" }
    | { type: "file" };

export type InputTypeName = InputType["type"];

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
    /** Куда складывать картинки из полей типа «Изображение». */
    imageFolder: string;
    /** Куда складывать всё остальное из полей типа «Файл». */
    fileFolder: string;
    /**
     * Не спрашивать подтверждение при закрытии редактора с несохранёнными
     * правками. Хранится в положительной форме «пропустить», чтобы значение
     * по умолчанию было false и подтверждение работало из коробки.
     */
    skipDiscardConfirm: boolean;
    /**
     * Разрешить поля типа «Список из запроса Dataview». Пока выключено,
     * плагин не исполняет пользовательский код ни в одном месте.
     */
    dataviewEnabled: boolean;
}

/**
 * Что редакторам нужно знать о настройках. Собирается из PluginSettings и
 * состояния хранилища, чтобы окна не тянули за собой весь плагин.
 */
export interface EditorContext {
    /** Тип Dataview включён в настройках И сам плагин Dataview на месте. */
    allowDataview: boolean;
    /** Спрашивать ли перед потерей несохранённых правок. */
    confirmDiscard: boolean;
}

/**
 * Человекочитаемые названия типов. Порядок ключей задаёт порядок в
 * выпадающем списке редактора, поэтому они сгруппированы по смыслу.
 */
export const INPUT_TYPE_LABELS: Record<InputTypeName, string> = {
    text: "Текст",
    textarea: "Многострочный текст",
    number: "Число",
    slider: "Ползунок",
    toggle: "Переключатель",
    date: "Дата",
    time: "Время",
    datetime: "Дата и время",
    select: "Выбор из списка",
    multiselect: "Выбор нескольких",
    tag: "Теги",
    dataview: "Список из запроса Dataview",
    note: "Заметка из папки",
    folder: "Папка",
    image: "Изображение",
    file: "Файл",
};
