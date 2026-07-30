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
    | { type: "email" }
    | { type: "tel" }
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

/** Условия, по которым поле может показываться или прятаться. */
export type ConditionKind =
    | "isSet"
    | "equals"
    | "contains"
    | "startsWith"
    | "endsWith"
    | "above"
    | "below"
    | "isTrue"
    | "isFalse";

export interface FieldCondition {
    /** Идентификатор поля, от которого зависит видимость. */
    field: string;
    kind: ConditionKind;
    /** Значение для сравнения. Для isSet, isTrue и isFalse не нужно. */
    value?: string | number;
}

export interface FieldDefinition {
    /** Ключ в результате формы. Уникален в пределах формы. */
    name: string;
    /** Подпись в интерфейсе. Если пустая — показываем name. */
    label?: string;
    description?: string;
    /** Серый текст внутри пустого поля: подсказка, чего от пользователя ждут. */
    placeholder?: string;
    required?: boolean;
    /**
     * Служебное поле: в форме не рисуется, но значение можно передать через
     * `openForm(..., { values })`, и оно попадёт в результат.
     */
    hidden?: boolean;
    /** Если задано — поле показывается только при выполнении условия. */
    condition?: FieldCondition;
    input: InputType;
}

/**
 * Переименование поля. Копится в истории формы, потому что заметки, созданные
 * до переименования, продолжают хранить старый ключ во frontmatter.
 */
export interface FieldRename {
    /** Версия формы, в которой произошло переименование. */
    version: number;
    from: string;
    to: string;
}

/** В каком виде команда выводит результат. */
export type OutputFormat = "frontmatter" | "dataview" | "list";

export const OUTPUT_FORMAT_LABELS: Record<OutputFormat, string> = {
    frontmatter: "YAML в шапке заметки",
    dataview: "Свойства (ключ:: значение)",
    list: "Маркированный список",
};

/** Что делает команда формы. */
export type CommandMode = "insert" | "create";

export const COMMAND_MODE_LABELS: Record<CommandMode, string> = {
    insert: "Вставить в текущую заметку",
    create: "Создать новую заметку",
};

export interface FormCommand {
    enabled: boolean;
    mode: CommandMode;
    format: OutputFormat;
    /** Режим создания: куда положить заметку. Пусто — корень хранилища. */
    folder?: string;
    /** Режим создания: из какого поля взять имя файла. */
    nameField?: string;
}

export interface FormDefinition {
    /** Уникальный идентификатор формы, по нему форма открывается из кода. */
    name: string;
    /** Заголовок модального окна. */
    title: string;
    /**
     * Версия формы. Растёт при переименовании поля — то есть при изменениях,
     * которые расходятся с уже созданными заметками.
     */
    version: number;
    /** Команда «Заполнить: …» в палитре. Без неё форма открывается только из кода. */
    command?: FormCommand;
    /** История переименований, по ней ищутся заметки под починку. */
    renames?: FieldRename[];
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
    /**
     * Сразу после переименования поля пройти по заметкам и переименовать ключ
     * во frontmatter. Когда выключено, то же делается кнопкой в настройках.
     */
    autoUpdateNotes: boolean;
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
    email: "Электронная почта",
    tel: "Телефон",
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
