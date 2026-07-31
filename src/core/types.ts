import type { Locale } from "../i18n";

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

/**
 * Множественный выбор. Источники те же, что у одиночного, но заметки можно
 * брать сразу из нескольких папок: `folder` — основная, `folders` — все
 * остальные. Основная отдельным полем, чтобы формы, сделанные до появления
 * списка, читались без переделки.
 */
export type MultiselectInput =
    | { type: "multiselect"; source: "fixed"; options: SelectOption[] }
    | { type: "multiselect"; source: "notes"; folder: string; folders?: string[] }
    | { type: "multiselect"; source: "dataview"; query: string };

/** Типы, у которых значений может быть несколько. */
export type MultiValueTypeName = "multiselect" | "tag";

/** Типы полей ввода, поддерживаемые на текущем этапе. */
export type InputType =
    /**
     * Не поле, а заголовок внутри формы: значения не собирает, нужен чтобы
     * длинный список полей делился на смысловые блоки.
     */
    | { type: "section" }
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
    /** `exclude` — регулярное выражение: подходящие теги в подсказку не идут. */
    | { type: "tag"; exclude?: string }
    | { type: "dataview"; query: string }
    | { type: "note"; folder: string }
    /** `parent` — предлагать только папки внутри неё. Пусто — всё хранилище. */
    | { type: "folder"; parent?: string }
    /**
     * Вложения. `folder` пустая — берётся папка из настроек плагина: общее
     * место остаётся значением по умолчанию, а форма может отправить свои
     * файлы в другое. `filenameTemplate` понимает `{{поле}}`; пустой —
     * сохраняем под исходным именем.
     */
    | { type: "image"; folder?: string; filenameTemplate?: string }
    | { type: "file"; folder?: string; filenameTemplate?: string; extensions?: string[] };

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

/**
 * Проверки ответа. Обязательность живёт отдельно (`required`) — она про
 * наличие ответа, а это про его содержимое, и проверяется только когда ответ
 * есть.
 */
export interface FieldRules {
    /** Число и ползунок: границы значения. */
    min?: number;
    max?: number;
    /** Текст: длина. Множественный выбор и теги: количество значений. */
    minLength?: number;
    maxLength?: number;
    /** Текст: регулярное выражение, которому ответ обязан соответствовать. */
    pattern?: string;
    /** Своё сообщение вместо сгенерированного: регэксп сам себя не объясняет. */
    message?: string;
}

export interface FieldDefinition {
    /** Ключ в результате формы. Уникален в пределах формы. */
    name: string;
    /** Подпись в интерфейсе. Если пустая — показываем name. */
    label?: string;
    description?: string;
    /** Серый текст внутри пустого поля: подсказка, чего от пользователя ждут. */
    placeholder?: string;
    /**
     * Чем поле заполнено при открытии формы. Понимает подстановки
     * `{{today}}`, `{{now}}` и `{{datetime}}`.
     */
    default?: string;
    required?: boolean;
    /**
     * Служебное поле: в форме не рисуется, но значение можно передать через
     * `openForm(..., { values })`, и оно попадёт в результат.
     */
    hidden?: boolean;
    /** Если задано — поле показывается только при выполнении условия. */
    condition?: FieldCondition;
    /** Проверки ответа. Применяются только к заполненному полю. */
    rules?: FieldRules;
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

/** Что делает команда формы. */
export type CommandMode = "update" | "create" | "insert";

/** Куда открыть созданную заметку. */
export type OpenMode = "current" | "tab" | "split" | "none";

export interface FormCommand {
    enabled: boolean;
    mode: CommandMode;
    format: OutputFormat;
    /**
     * Режим создания: куда положить заметку. Шаблон с подстановками —
     * «Книги/{{genre}}». Пусто — корень хранилища.
     */
    folder?: string;
    /**
     * Режим создания: шаблон имени файла — «{{author}} — {{title}}».
     * Пусто — берётся заголовок формы.
     */
    nameTemplate?: string;
    /** Режим создания: где показать заметку после создания. */
    openIn?: OpenMode;
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
    /**
     * Папка в списке форм. Это просто ярлык для группировки, к папкам
     * хранилища отношения не имеет. Пусто — форма лежит «без папки».
     */
    folder?: string;
    /** Иконка Lucide в карточке формы. Пусто — берётся общая. */
    icon?: string;
    /** Команда «Заполнить: …» в палитре. Без неё форма открывается только из кода. */
    command?: FormCommand;
    /**
     * Вид заметки с подстановками `{{ поле }}`. Особые: `{{frontmatter}}` —
     * вся шапка YAML разом, `{{cursor}}` — куда встанет курсор после вставки.
     * Пустой шаблон означает вывод одним из готовых форматов.
     */
    template?: string;
    /** История переименований, по ней ищутся заметки под починку. */
    renames?: FieldRename[];
    fields: FieldDefinition[];
}

export interface PluginSettings {
    forms: FormDefinition[];
    /**
     * Папки, созданные в браузере форм. Список нужен только пустым папкам:
     * у непустой название и так читается из самих форм. Порядок хранения не
     * важен — в списке папки идут по алфавиту.
     */
    folders: string[];
    /**
     * Убрать строку «Все формы» из браузера, когда все формы разложены по
     * папкам. Пока есть формы без папки, строка остаётся: иначе до них не
     * добраться иначе как через раздел «Без папки».
     */
    hideAllFormsFolder: boolean;
    /**
     * Отдавать шаблоны заметок на обработку Templater. Пока выключено, его
     * команды остаются в тексте как есть: чужой плагин исполняет код, и
     * включать это молча нельзя.
     */
    templaterEnabled: boolean;
    /**
     * Имя глобальной переменной с API. Меняют его редко и по одной причине:
     * привычное имя уже занял другой плагин или свой скрипт.
     */
    globalName: string;
    /**
     * Язык интерфейса. При установке берётся язык Obsidian, если такой
     * словарь есть; дальше меняется только руками.
     */
    language: Locale;
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
/** Типы, которые ничего не спрашивают у пользователя и не дают значения. */
export function isDecorative(type: InputTypeName): boolean {
    return type === "section";
}
