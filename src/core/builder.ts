import { validateFields } from "./fields";
import { freeNameFrom } from "./naming";
import type {
    FieldCondition,
    FieldDefinition,
    FormDefinition,
    InputType,
    SelectOption,
} from "./types";

/**
 * Сборка формы кодом. Нужна не ради краткости, а ради самодостаточности:
 * форма живёт внутри скрипта или шаблона Templater, и её не надо заводить в
 * настройках заранее — такой шаблон можно отдать другому человеку целиком.
 *
 * То же самое можно написать объектом и передать в `openForm`. Разница в
 * том, что здесь опечатка в имени типа видна сразу, а не пустым полем в
 * открывшемся окне.
 */

/** Свойства, общие для всех полей. */
export interface FieldOptions {
    name: string;
    label?: string;
    description?: string;
    placeholder?: string;
    default?: string;
    required?: boolean;
    hidden?: boolean;
    condition?: FieldCondition;
}

type Named = Omit<FieldOptions, "name"> & { name?: string };

export class FormBuilder {
    private fields: FieldDefinition[] = [];
    private noteTemplate: string | undefined;

    constructor(
        private name: string,
        private title: string,
    ) {}

    // === Простые поля ===

    text(options: FieldOptions): this {
        return this.add({ type: "text" }, options);
    }

    textarea(options: FieldOptions): this {
        return this.add({ type: "textarea" }, options);
    }

    email(options: FieldOptions): this {
        return this.add({ type: "email" }, options);
    }

    tel(options: FieldOptions): this {
        return this.add({ type: "tel" }, options);
    }

    number(options: FieldOptions): this {
        return this.add({ type: "number" }, options);
    }

    toggle(options: FieldOptions): this {
        return this.add({ type: "toggle" }, options);
    }

    date(options: FieldOptions): this {
        return this.add({ type: "date" }, options);
    }

    time(options: FieldOptions): this {
        return this.add({ type: "time" }, options);
    }

    datetime(options: FieldOptions): this {
        return this.add({ type: "datetime" }, options);
    }

    slider(options: FieldOptions & { min?: number; max?: number; step?: number }): this {
        return this.add(
            {
                type: "slider",
                min: options.min ?? 0,
                max: options.max ?? 10,
                step: options.step ?? 1,
            },
            options,
        );
    }

    // === Выбор ===

    /**
     * Список значений принимает и в коротком виде — массив строк: подпись
     * тогда совпадает со значением, а это самый частый случай.
     */
    select(options: FieldOptions & { options?: (string | SelectOption)[]; folder?: string }): this {
        const input: InputType =
            options.folder === undefined
                ? { type: "select", source: "fixed", options: toOptions(options.options) }
                : { type: "select", source: "notes", folder: options.folder };
        return this.add(input, options);
    }

    multiselect(
        options: FieldOptions & {
            options?: (string | SelectOption)[];
            folder?: string;
            folders?: string[];
            query?: string;
        },
    ): this {
        let input: InputType;
        if (options.query !== undefined) {
            input = { type: "multiselect", source: "dataview", query: options.query };
        } else if (options.folder !== undefined) {
            input = { type: "multiselect", source: "notes", folder: options.folder };
            if (options.folders && options.folders.length > 0) input.folders = options.folders;
        } else {
            input = { type: "multiselect", source: "fixed", options: toOptions(options.options) };
        }
        return this.add(input, options);
    }

    tag(options: FieldOptions & { exclude?: string }): this {
        const input: InputType = { type: "tag" };
        if (options.exclude !== undefined) input.exclude = options.exclude;
        return this.add(input, options);
    }

    dataview(options: FieldOptions & { query: string }): this {
        return this.add({ type: "dataview", query: options.query }, options);
    }

    note(options: FieldOptions & { folder?: string }): this {
        return this.add({ type: "note", folder: options.folder ?? "" }, options);
    }

    folder(options: FieldOptions & { parent?: string }): this {
        const input: InputType = { type: "folder" };
        if (options.parent !== undefined) input.parent = options.parent;
        return this.add(input, options);
    }

    // === Вложения ===

    image(options: FieldOptions & { folder?: string; filenameTemplate?: string }): this {
        const input: InputType = { type: "image" };
        if (options.folder !== undefined) input.folder = options.folder;
        if (options.filenameTemplate !== undefined) {
            input.filenameTemplate = options.filenameTemplate;
        }
        return this.add(input, options);
    }

    file(
        options: FieldOptions & {
            folder?: string;
            filenameTemplate?: string;
            extensions?: string[];
        },
    ): this {
        const input: InputType = { type: "file" };
        if (options.folder !== undefined) input.folder = options.folder;
        if (options.filenameTemplate !== undefined) {
            input.filenameTemplate = options.filenameTemplate;
        }
        if (options.extensions && options.extensions.length > 0) {
            input.extensions = options.extensions;
        }
        return this.add(input, options);
    }

    /**
     * Заголовок внутри формы. Идентификатор ему не нужен по смыслу, но нужен
     * модели — подставляем его сами, чтобы в скрипте не приходилось выдумывать
     * имена для того, что значений не собирает.
     */
    section(options: Named & { label: string }): this {
        // Имя подбираем по тем же правилам, что редактор: только латинские
        // буквы, поэтому счётчик буквенный — «section», «sectionA», «sectionB».
        const name =
            options.name ??
            freeNameFrom((candidate) => this.fields.some((f) => f.name === candidate), "section");
        return this.add({ type: "section" }, { ...options, name });
    }

    /** Шаблон заметки — тот же, что в свойствах сохранённой формы. */
    template(text: string): this {
        this.noteTemplate = text;
        return this;
    }

    /**
     * Готовое определение формы.
     *
     * Проверка здесь строгая, с исключением: форма собрана кодом, и об
     * ошибке некому сказать, кроме как тому, кто этот код пишет. Молча
     * открыть окно без половины полей было бы хуже.
     */
    build(): FormDefinition {
        const error = validateFields(this.fields);
        if (error) throw new Error(`Oxill Forms: ${error}`);

        const form: FormDefinition = {
            name: this.name,
            title: this.title === "" ? this.name : this.title,
            version: 1,
            fields: this.fields,
        };
        if (this.noteTemplate !== undefined) form.template = this.noteTemplate;
        return form;
    }

    private add(input: InputType, options: FieldOptions): this {
        const field: FieldDefinition = { name: options.name, input };

        if (options.label !== undefined) field.label = options.label;
        if (options.description !== undefined) field.description = options.description;
        if (options.placeholder !== undefined) field.placeholder = options.placeholder;
        if (options.default !== undefined) field.default = options.default;
        if (options.required === true) field.required = true;
        if (options.hidden === true) field.hidden = true;
        if (options.condition !== undefined) field.condition = options.condition;

        this.fields.push(field);
        return this;
    }
}

function toOptions(values: (string | SelectOption)[] | undefined): SelectOption[] {
    return (values ?? []).map((value) =>
        typeof value === "string" ? { value, label: value } : value,
    );
}

export function builder(name: string, title = ""): FormBuilder {
    return new FormBuilder(name, title);
}
