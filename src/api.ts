import { App, TFile } from "obsidian";
import { builder } from "./core/builder";
import type { FormBuilder } from "./core/builder";
import { isDataviewAvailable } from "./core/dataview";
import { defaultValues } from "./core/defaults";
import { findForm } from "./core/forms";
import { valuesFromFrontmatter } from "./core/prefill";
import { FormResult } from "./core/FormResult";
import type { FormData } from "./core/FormResult";
import type { FormDefinition, PluginSettings } from "./core/types";
import { FormModal } from "./ui/FormModal";

export interface OpenFormOptions {
    /** Значения, которыми поля заполняются заранее. */
    values?: Partial<FormData>;
    /**
     * Подставить значения из шапки заметки: `true` — из открытой сейчас,
     * строка — из заметки по этому пути. То, что передано в `values`,
     * важнее — оно перекрывает взятое из заметки.
     */
    fromNote?: boolean | string;
}

/**
 * То, что доступно снаружи: из Templater, QuickAdd, DataviewJS и консоли.
 * Публичная поверхность намеренно маленькая — её потом нельзя менять,
 * не сломав чужие скрипты.
 */
export class ModalFormsApi {
    constructor(
        private app: App,
        private getSettings: () => PluginSettings,
    ) {}

    /**
     * Сборка формы кодом — для форм, которые живут в скрипте, а не в
     * настройках. Результат `build()` принимает `openForm`.
     *
     * ```js
     * const form = MFL.builder("book", "Новая книга")
     *     .text({ name: "title", label: "Название", required: true })
     *     .slider({ name: "rating", label: "Оценка", min: 1, max: 5 })
     *     .build();
     * const result = await MFL.openForm(form);
     * ```
     */
    builder(name: string, title = ""): FormBuilder {
        return builder(name, title);
    }

    /** Идентификаторы всех сохранённых форм. */
    listForms(): string[] {
        return this.getSettings().forms.map((form) => form.name);
    }

    /** Определение формы по идентификатору. */
    getForm(name: string): FormDefinition | undefined {
        return findForm(this.getSettings().forms, name);
    }

    /**
     * Открывает форму и ждёт ответа пользователя.
     * Принимает идентификатор сохранённой формы или определение целиком —
     * второе удобно для одноразовых форм прямо в скрипте.
     *
     * Отмена не считается ошибкой: промис исполняется результатом со
     * статусом `cancelled`. Проверяйте `result.ok` перед использованием.
     */
    openForm(
        reference: string | FormDefinition,
        options: OpenFormOptions = {},
    ): Promise<FormResult> {
        const definition = typeof reference === "string" ? this.getForm(reference) : reference;

        if (!definition) {
            return Promise.reject(
                new Error(`Modal Forms Lite: форма «${reference as string}» не найдена`),
            );
        }

        const settings = this.getSettings();
        // От общего к частному: настройки формы, потом открытая заметка,
        // потом то, что явно передали из кода.
        const initial = {
            ...defaultValues(definition.fields),
            ...this.valuesFromNote(definition, options.fromNote),
            ...(options.values ?? {}),
        };

        return new Promise((resolve) => {
            new FormModal(
                this.app,
                definition,
                {
                    imageFolder: settings.imageFolder,
                    fileFolder: settings.fileFolder,
                    dataviewEnabled:
                        settings.dataviewEnabled && isDataviewAvailable(this.app),
                    confirmDiscard: !settings.skipDiscardConfirm,
                },
                resolve,
                initial,
            ).open();
        });
    }

    /** Значения из шапки заметки для полей с совпадающими именами. */
    private valuesFromNote(
        form: FormDefinition,
        fromNote: boolean | string | undefined,
    ): Partial<FormData> {
        if (fromNote === undefined || fromNote === false) return {};

        const file =
            typeof fromNote === "string"
                ? this.app.vault.getAbstractFileByPath(fromNote)
                : this.app.workspace.getActiveFile();

        if (!(file instanceof TFile)) return {};
        return valuesFromFrontmatter(
            form.fields,
            this.app.metadataCache.getFileCache(file)?.frontmatter,
        );
    }
}
