import { App, Notice, PluginSettingTab } from "obsidian";
import type { SettingDefinition, SettingDefinitionGroup, SettingDefinitionItem } from "obsidian";
import { isDataviewAvailable } from "../core/dataview";
import { bundleToJson } from "../core/exchange";
import { freeName } from "../core/forms";
import { isLocale, LANGUAGE_NAMES, setLanguage, t } from "../i18n";
import { isValidGlobalName } from "../core/naming";
import { DEFAULT_GLOBAL_NAME } from "../core/settings";
import { isTemplaterAvailable } from "../core/templater";
import { createNote } from "../core/vault";
import { applyNoteUpdates, scanNotes } from "../core/noteMigration";
import type { NoteUpdate } from "../core/noteMigration";
import type FormsPlugin from "../main";
import { FormListModal } from "../ui/FormListModal";
import { ImportFormModal } from "../ui/ImportFormModal";

/**
 * Вкладка настроек описанием, а не разметкой.
 *
 * С 1.13 Obsidian сам рисует вкладку по списку определений и по нему же ищет
 * настройки в общем поиске. Рисовать руками через `display()` всё ещё можно,
 * но тогда наши настройки поиском не находятся — для пользователя они просто
 * не существуют, пока он не откроет вкладку и не прочитает её глазами.
 *
 * Простые строки — `control`: движок сам читает значение через
 * `getControlValue`, пишет через `setControlValue` и сам же гасит контрол по
 * предикату `disabled`. Строки с двумя кнопками или своей логикой ввода
 * остаются за `render`: он даёт готовый `Setting`, но имя и описание из
 * определения уже проставлены, поэтому в поиск такая строка попадает наравне
 * с остальными.
 *
 * Перерисовка — `update()`, а не `display()`: она пересобирает определения,
 * тогда как повторный `display()` для декларативной вкладки ничего не делает.
 */
export class FormsSettingTab extends PluginSettingTab {
    /** Результат последнего сканирования: null — ещё не искали. */
    private found: NoteUpdate[] | null = null;

    constructor(
        app: App,
        private plugin: FormsPlugin,
    ) {
        super(app, plugin);
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            this.formsGroup(),
            this.languageGroup(),
            this.attachmentsGroup(),
            this.extraGroup(),
            this.notesGroup(),
        ];
    }

    /**
     * Значение для строки-контрола. Переключатели Dataview и Templater
     * показывают «выключено», когда соответствующего плагина нет: сохранённое
     * «включено» обещало бы работу, которой не будет.
     */
    getControlValue(key: string): unknown {
        const settings = this.plugin.settings;

        switch (key) {
            case "language":
                return settings.language;
            case "imageFolder":
                return settings.imageFolder;
            case "fileFolder":
                return settings.fileFolder;
            case "hideAllFormsFolder":
                return settings.hideAllFormsFolder;
            case "skipDiscardConfirm":
                return settings.skipDiscardConfirm;
            case "dataviewEnabled":
                return settings.dataviewEnabled && isDataviewAvailable(this.app);
            case "templaterEnabled":
                return settings.templaterEnabled && isTemplaterAvailable(this.app);
            case "autoUpdateNotes":
                return settings.autoUpdateNotes;
            default:
                return undefined;
        }
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        switch (key) {
            case "language": {
                if (!isLocale(value)) return;
                await this.plugin.updateSettings({ language: value });
                // Сразу применяем и перерисовываем: увидеть новый язык тут же
                // убедительнее любой надписи «требуется перезапуск».
                setLanguage(value);
                this.plugin.refreshCommands();
                this.update();
                return;
            }
            case "imageFolder": {
                if (typeof value !== "string") return;
                await this.plugin.updateSettings({ imageFolder: value.trim() });
                return;
            }
            case "fileFolder": {
                if (typeof value !== "string") return;
                await this.plugin.updateSettings({ fileFolder: value.trim() });
                return;
            }
            case "hideAllFormsFolder": {
                if (typeof value !== "boolean") return;
                await this.plugin.updateSettings({ hideAllFormsFolder: value });
                return;
            }
            case "skipDiscardConfirm": {
                if (typeof value !== "boolean") return;
                await this.plugin.updateSettings({ skipDiscardConfirm: value });
                return;
            }
            case "dataviewEnabled": {
                if (typeof value !== "boolean") return;
                await this.plugin.updateSettings({ dataviewEnabled: value });
                return;
            }
            case "templaterEnabled": {
                if (typeof value !== "boolean") return;
                await this.plugin.updateSettings({ templaterEnabled: value });
                return;
            }
            case "autoUpdateNotes": {
                if (typeof value !== "boolean") return;
                await this.plugin.updateSettings({ autoUpdateNotes: value });
                // В автоматическом режиме чинить нечего: строка сканирования
                // уходит целиком, а это уже другой состав вкладки.
                this.found = null;
                this.update();
                return;
            }
        }
    }

    /** Результат сканирования не должен переживать закрытие настроек. */
    hide(): void {
        this.found = null;
    }

    /** Общая обёртка группы: карточка та же, что и в наших окнах. */
    private group(heading: string, items: SettingDefinition[]): SettingDefinitionGroup {
        return { type: "group", heading, cls: "oxf-settings-group", items };
    }

    /**
     * Пояснение к разделу. У группы своего описания нет, поэтому это строка
     * без контрола и без имени — из поиска она исключена, чтобы не всплывать
     * там отдельной настройкой.
     */
    private note(text: string): SettingDefinition {
        return {
            name: "",
            desc: text,
            searchable: false,
            render: (setting) => {
                setting.setClass("oxf-group-note");
            },
        };
    }

    private formsGroup(): SettingDefinitionGroup {
        return this.group(t("settings.formsGroup"), [
            this.note(t("settings.formsGroupDesc")),
            {
                name: t("settings.browser"),
                desc: t("settings.browserDesc"),
                render: (setting) => {
                    setting.addButton((button) =>
                        button
                            .setButtonText(t("settings.formList"))
                            .onClick(() => new FormListModal(this.app, this.plugin).open()),
                    );
                    setting.addButton((button) =>
                        button
                            .setButtonText(t("settings.createForm"))
                            .setCta()
                            .onClick(() => this.plugin.openCreateFormModal()),
                    );
                },
            },
            {
                name: t("settings.import"),
                desc: t("settings.importDesc"),
                render: (setting) => {
                    setting.addButton((button) =>
                        button
                            .setButtonText(t("settings.importButton"))
                            .onClick(() => this.importForm()),
                    );
                },
            },
            this.exportItem(),
        ]);
    }

    /**
     * Язык плагина. Названия языков написаны на них самих: их узнают, даже
     * когда настройки говорят на непонятном.
     */
    private languageGroup(): SettingDefinitionGroup {
        return this.group(t("settings.languageGroup"), [
            {
                name: t("settings.language"),
                desc: t("settings.languageDesc"),
                control: {
                    type: "dropdown",
                    key: "language",
                    options: { ...LANGUAGE_NAMES },
                },
            },
        ]);
    }

    /**
     * Папку можно выбрать из существующих или вписать несуществующую — тогда
     * она будет создана при первой загрузке вложения. Пустое поле означает
     * корень хранилища.
     */
    private attachmentsGroup(): SettingDefinitionGroup {
        return this.group(t("settings.attachmentsGroup"), [
            {
                name: t("settings.imageFolder"),
                desc: t("settings.imageFolderDesc"),
                control: {
                    type: "folder",
                    key: "imageFolder",
                    placeholder: t("settings.folderPlaceholder"),
                },
            },
            {
                name: t("settings.fileFolder"),
                desc: t("settings.fileFolderDesc"),
                control: {
                    type: "folder",
                    key: "fileFolder",
                    placeholder: t("settings.folderPlaceholder"),
                },
            },
        ]);
    }

    private extraGroup(): SettingDefinitionGroup {
        const dataview = isDataviewAvailable(this.app);
        const templater = isTemplaterAvailable(this.app);

        return this.group(t("settings.extraGroup"), [
            {
                name: t("settings.hideAllForms"),
                desc: t("settings.hideAllFormsDesc"),
                control: { type: "toggle", key: "hideAllFormsFolder" },
            },
            {
                name: t("settings.skipDiscard"),
                desc: t("settings.skipDiscardDesc"),
                control: { type: "toggle", key: "skipDiscardConfirm" },
            },
            // Нет плагина — нечего включать, поэтому переключатель гаснет, а не
            // обещает то, чего не будет.
            {
                name: t("settings.dataview"),
                desc: dataview ? t("settings.dataviewOn") : t("settings.dataviewOff"),
                control: {
                    type: "toggle",
                    key: "dataviewEnabled",
                    disabled: () => !isDataviewAvailable(this.app),
                },
            },
            {
                name: t("settings.templater"),
                desc: templater ? t("settings.templaterOn") : t("settings.templaterOff"),
                control: {
                    type: "toggle",
                    key: "templaterEnabled",
                    disabled: () => !isTemplaterAvailable(this.app),
                },
            },
            this.globalNameItem(),
        ]);
    }

    private notesGroup(): SettingDefinitionGroup {
        return this.group(t("settings.notesGroup"), [
            {
                name: t("settings.autoUpdate"),
                desc: t("settings.autoUpdateDesc"),
                control: { type: "toggle", key: "autoUpdateNotes" },
            },
            // Кнопка нужна только в ручном режиме: при автоматическом чинить
            // нечего.
            ...(this.plugin.settings.autoUpdateNotes ? [] : [this.scanItem()]),
        ]);
    }

    /** Экспорт всех форм разом: перенос в другое хранилище одним движением. */
    private exportItem(): SettingDefinition {
        const forms = this.plugin.settings.forms;

        if (forms.length === 0) {
            return { name: t("settings.export"), desc: t("settings.exportEmpty") };
        }

        return {
            name: t("settings.export"),
            desc: t("settings.exportDesc", { count: forms.length }),
            render: (setting) => {
                setting.addButton((button) =>
                    button.setButtonText(t("settings.exportClipboard")).onClick(async () => {
                        try {
                            await navigator.clipboard.writeText(
                                bundleToJson(forms, this.plugin.manifest.version),
                            );
                            new Notice(t("settings.exportedCount", { count: forms.length }));
                        } catch (error) {
                            console.error("[oxill-forms] не удалось скопировать формы", error);
                            new Notice(t("browser.clipboardFailed"));
                        }
                    }),
                );

                setting.addButton((button) =>
                    button.setButtonText(t("settings.exportNote")).onClick(async () => {
                        const json = bundleToJson(forms, this.plugin.manifest.version);
                        const stamp = new Date().toISOString().slice(0, 10);
                        const content = `${t("settings.exportNoteBody", { date: stamp })}\n\n\`\`\`json\n${json}\n\`\`\`\n`;

                        try {
                            const file = await createNote(
                                this.app,
                                "",
                                t("settings.exportNoteTitle", { date: stamp }),
                                content,
                            );
                            await this.app.workspace.getLeaf(false).openFile(file);
                        } catch (error) {
                            console.error("[oxill-forms] не удалось создать заметку", error);
                            new Notice(t("settings.noteFailed"));
                        }
                    }),
                );
            },
        };
    }

    /**
     * Имя глобальной переменной с API. Сохраняем не на каждое нажатие, а по
     * уходу из поля: на полпути к «ModalForms» имя вроде «Mod» тоже годное, и
     * API успело бы полежать под ним. Готовый контрол `text` пишет значение
     * сразу, поэтому строка остаётся своей.
     */
    private globalNameItem(): SettingDefinition {
        const current = this.plugin.settings.globalName;

        return {
            name: t("settings.globalName"),
            desc: t("settings.globalNameDesc", { name: current }),
            render: (setting) => {
                setting.addText((text) => {
                    text.setPlaceholder(DEFAULT_GLOBAL_NAME).setValue(current);

                    text.inputEl.addEventListener("blur", () => void (async () => {
                        const name = text.getValue().trim();
                        if (name === current) return;

                        // Пустое поле — возврат к привычному имени, а не
                        // отсутствие переменной: без неё API не достать
                        // ниоткуда.
                        const wanted = name === "" ? DEFAULT_GLOBAL_NAME : name;
                        if (!isValidGlobalName(wanted)) {
                            new Notice(t("settings.globalNameBad"));
                            text.setValue(current);
                            return;
                        }

                        await this.plugin.updateSettings({ globalName: wanted });
                        this.plugin.exposeApi(wanted);
                        new Notice(t("settings.globalNameSet", { name: wanted }));
                        this.update();
                    })());
                });
            },
        };
    }

    /**
     * Две стадии в одной кнопке: сначала поиск, потом применение найденного.
     * Разделено намеренно — правка frontmatter необратима, и увидеть объём до
     * применения важнее, чем сэкономить нажатие.
     */
    private scanItem(): SettingDefinition {
        const found = this.found;

        if (found === null) {
            return {
                name: t("settings.scan"),
                desc: t("settings.scanDesc"),
                render: (setting) => {
                    setting.addButton((button) =>
                        button.setButtonText(t("settings.scanButton")).onClick(() => {
                            const scanned = scanNotes(this.app, this.plugin.settings.forms);
                            if (scanned.length === 0) {
                                new Notice(t("settings.scanNothing"));
                                return;
                            }
                            this.found = scanned;
                            this.update();
                        }),
                    );
                },
            };
        }

        const count = found.length;

        return {
            name: t("settings.scan"),
            desc: t("settings.scanFound"),
            render: (setting) => {
                setting.addButton((button) =>
                    button.setButtonText(t("common.cancel")).onClick(() => {
                        this.found = null;
                        this.update();
                    }),
                );

                setting.addButton((button) =>
                    button
                        .setButtonText(t("settings.scanApply", { count }))
                        .setCta()
                        .onClick(async () => {
                            this.found = null;
                            const { changed, failed } = await applyNoteUpdates(this.app, found);
                            new Notice(t("settings.notesUpdated", { count: changed }));
                            if (failed.length > 0) {
                                new Notice(t("settings.notesFailed", { count: failed.length }));
                            }
                            this.update();
                        }),
                );
            },
        };
    }

    private importForm(): void {
        new ImportFormModal(this.app, {
            pluginVersion: this.plugin.manifest.version,
            isNameTaken: (name) => this.plugin.isNameTaken(name),
            freeName: (base) => freeName(this.plugin.settings.forms, base),
            onImport: async (forms, renamed) => {
                for (const form of forms) await this.plugin.upsertForm(form);

                new Notice(t("settings.imported", { count: forms.length }));
                if (renamed.length > 0) {
                    new Notice(t("settings.importRenamed", { names: renamed.join(", ") }));
                }
            },
        }).open();
    }
}
