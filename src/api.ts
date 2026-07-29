import { App } from "obsidian";
import { isDataviewAvailable } from "./core/dataview";
import { findForm } from "./core/forms";
import { FormResult } from "./core/FormResult";
import type { FormData } from "./core/FormResult";
import type { FormDefinition, PluginSettings } from "./core/types";
import { FormModal } from "./ui/FormModal";

export interface OpenFormOptions {
    /** Значения, которыми поля заполняются заранее. */
    values?: Partial<FormData>;
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
        return new Promise((resolve) => {
            new FormModal(
                this.app,
                definition,
                {
                    imageFolder: settings.imageFolder,
                    fileFolder: settings.fileFolder,
                    dataviewEnabled:
                        settings.dataviewEnabled && isDataviewAvailable(this.app),
                },
                resolve,
                options.values ?? {},
            ).open();
        });
    }
}
