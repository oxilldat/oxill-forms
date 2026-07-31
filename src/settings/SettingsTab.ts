import { App, Notice, PluginSettingTab, Setting } from "obsidian";
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
import type ModalFormsLitePlugin from "../main";
import { FolderSuggest } from "../ui/FolderSuggest";
import { FormListModal } from "../ui/FormListModal";
import { ImportFormModal } from "../ui/ImportFormModal";
import { settingsGroup } from "../ui/settingsGroup";

export class ModalFormsSettingTab extends PluginSettingTab {
    /** Результат последнего сканирования: null — ещё не искали. */
    private found: NoteUpdate[] | null = null;

    constructor(
        app: App,
        private plugin: ModalFormsLitePlugin,
    ) {
        super(app, plugin);
    }

    private group(name: string, description?: string): HTMLElement {
        return settingsGroup(this.containerEl, name, description);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        const forms = this.group(
            t("settings.formsGroup"),
            t("settings.formsGroupDesc"),
        );

        new Setting(forms)
            .setName(t("settings.browser"))
            .setDesc(t("settings.browserDesc"))
            .addButton((button) =>
                button
                    .setButtonText(t("settings.formList"))
                    .onClick(() => new FormListModal(this.app, this.plugin).open()),
            )
            .addButton((button) =>
                button
                    .setButtonText(t("settings.createForm"))
                    .setCta()
                    .onClick(() => this.plugin.openCreateFormModal()),
            );

        this.renderImportSetting(forms);
        this.renderExportSetting(forms);

        this.renderLanguageSetting();

        const attachments = this.group(t("settings.attachmentsGroup"));

        this.renderFolderSetting(
            attachments,
            t("settings.imageFolder"),
            t("settings.imageFolderDesc"),
            this.plugin.settings.imageFolder,
            (folder) => this.plugin.updateSettings({ imageFolder: folder }),
        );

        this.renderFolderSetting(
            attachments,
            t("settings.fileFolder"),
            t("settings.fileFolderDesc"),
            this.plugin.settings.fileFolder,
            (folder) => this.plugin.updateSettings({ fileFolder: folder }),
        );

        const extra = this.group(t("settings.extraGroup"));

        new Setting(extra)
            .setName(t("settings.hideAllForms"))
            .setDesc(
                t("settings.hideAllFormsDesc"),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.hideAllFormsFolder)
                    .onChange((value) =>
                        this.plugin.updateSettings({ hideAllFormsFolder: value }),
                    ),
            );

        new Setting(extra)
            .setName(t("settings.skipDiscard"))
            .setDesc(
                t("settings.skipDiscardDesc"),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.skipDiscardConfirm)
                    .onChange((value) =>
                        this.plugin.updateSettings({ skipDiscardConfirm: value }),
                    ),
            );

        this.renderDataviewSetting(extra);
        this.renderTemplaterSetting(extra);
        this.renderGlobalNameSetting(extra);

        const notes = this.group(t("settings.notesGroup"));

        new Setting(notes)
            .setName(t("settings.autoUpdate"))
            .setDesc(
                t("settings.autoUpdateDesc"),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoUpdateNotes)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings({ autoUpdateNotes: value });
                        this.found = null;
                        this.display();
                    }),
            );

        // Кнопка нужна только в ручном режиме: при автоматическом чинить нечего.
        if (!this.plugin.settings.autoUpdateNotes) this.renderScanSetting(notes);
    }

    /**
     * Две стадии в одной кнопке: сначала поиск, потом применение найденного.
     * Разделено намеренно — правка frontmatter необратима, и увидеть объём
     * до применения важнее, чем сэкономить нажатие.
     */
    private renderScanSetting(container: HTMLElement): void {
        const setting = new Setting(container).setName(t("settings.scan"));

        if (this.found === null) {
            setting.setDesc(t("settings.scanDesc"));
            setting.addButton((button) =>
                button.setButtonText(t("settings.scanButton")).onClick(() => {
                    const found = scanNotes(this.app, this.plugin.settings.forms);
                    if (found.length === 0) {
                        new Notice(t("settings.scanNothing"));
                        return;
                    }
                    this.found = found;
                    this.display();
                }),
            );
            return;
        }

        const count = this.found.length;
        setting.setDesc(t("settings.scanFound"));

        setting.addButton((button) =>
            button.setButtonText(t("common.cancel")).onClick(() => {
                this.found = null;
                this.display();
            }),
        );

        setting.addButton((button) =>
            button
                .setButtonText(t("settings.scanApply", { count }))
                .setCta()
                .onClick(async () => {
                    const updates = this.found ?? [];
                    this.found = null;
                    const { changed, failed } = await applyNoteUpdates(this.app, updates);
                    new Notice(t("settings.notesUpdated", { count: changed }));
                    if (failed.length > 0) {
                        new Notice(t("settings.notesFailed", { count: failed.length }));
                    }
                    this.display();
                }),
        );
    }

    /** Результат сканирования не должен переживать закрытие настроек. */
    hide(): void {
        this.found = null;
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

    /** Импорт форм из конверта — отдельной строкой, в пару к экспорту. */
    private renderImportSetting(container: HTMLElement): void {
        new Setting(container)
            .setName(t("settings.import"))
            .setDesc(t("settings.importDesc"))
            .addButton((button) =>
                button.setButtonText(t("settings.importButton")).onClick(() => this.importForm()),
            );
    }

    /** Экспорт всех форм разом: перенос в другое хранилище одним движением. */
    private renderExportSetting(container: HTMLElement): void {
        const forms = this.plugin.settings.forms;

        const setting = new Setting(container)
            .setName(t("settings.export"))
            .setDesc(t("settings.exportDesc", { count: forms.length }));

        if (forms.length === 0) {
            setting.setDesc(t("settings.exportEmpty"));
            return;
        }

        setting.addButton((button) =>
            button.setButtonText(t("settings.exportClipboard")).onClick(async () => {
                try {
                    await navigator.clipboard.writeText(
                        bundleToJson(forms, this.plugin.manifest.version),
                    );
                    new Notice(t("settings.exportedCount", { count: forms.length }));
                } catch (error) {
                    console.error("[modal-forms-lite] не удалось скопировать формы", error);
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
                    console.error("[modal-forms-lite] не удалось создать заметку", error);
                    new Notice(t("settings.noteFailed"));
                }
            }),
        );
    }

    /**
     * Переключатель полей Dataview. Если самого плагина нет, включать нечего —
     * запрос всё равно не выполнить, поэтому переключатель блокируем.
     */
    private renderDataviewSetting(container: HTMLElement): void {
        const available = isDataviewAvailable(this.app);

        const setting = new Setting(container)
            .setName(t("settings.dataview"))
            .setDesc(
                available
                    ? t("settings.dataviewOn")
                    : t("settings.dataviewOff"),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.dataviewEnabled && available)
                    .setDisabled(!available)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings({ dataviewEnabled: value });
                        // Описание зависит от состояния, проще перерисовать всё.
                        this.display();
                    }),
            );

        if (!available) setting.setClass("mfl-setting-disabled");
    }

    /**
     * Язык плагина. Названия языков написаны на них самих: их узнают, даже
     * когда настройки говорят на непонятном.
     */
    private renderLanguageSetting(): void {
        const group = this.group(t("settings.languageGroup"));

        new Setting(group)
            .setName(t("settings.language"))
            .setDesc(t("settings.languageDesc"))
            .addDropdown((dropdown) => {
                for (const [code, name] of Object.entries(LANGUAGE_NAMES)) {
                    dropdown.addOption(code, name);
                }
                dropdown.setValue(this.plugin.settings.language).onChange(async (value) => {
                    if (!isLocale(value)) return;
                    await this.plugin.updateSettings({ language: value });
                    // Сразу применяем и перерисовываем: увидеть новый язык
                    // тут же убедительнее любой надписи «требуется перезапуск».
                    setLanguage(value);
                    this.plugin.refreshCommands();
                    this.display();
                });
            });
    }

    /**
     * Обработка шаблонов через Templater. Как и с Dataview: нет плагина —
     * нечего включать, поэтому переключатель блокируется, а не обещает то,
     * чего не будет.
     */
    private renderTemplaterSetting(container: HTMLElement): void {
        const available = isTemplaterAvailable(this.app);

        const setting = new Setting(container)
            .setName(t("settings.templater"))
            .setDesc(
                available
                    ? t("settings.templaterOn")
                    : t("settings.templaterOff"),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.templaterEnabled && available)
                    .setDisabled(!available)
                    .onChange(async (value) => {
                        await this.plugin.updateSettings({ templaterEnabled: value });
                        this.display();
                    }),
            );

        if (!available) setting.setClass("mfl-setting-disabled");
    }

    /**
     * Имя глобальной переменной с API. Сохраняем не на каждое нажатие, а по
     * уходу из поля: на полпути к «ModalForms» имя вроде «Mod» тоже годное,
     * и API успело бы полежать под ним.
     */
    private renderGlobalNameSetting(container: HTMLElement): void {
        const current = this.plugin.settings.globalName;

        new Setting(container)
            .setName(t("settings.globalName"))
            .setDesc(
                t("settings.globalNameDesc", { name: current }),
            )
            .addText((text) => {
                text.setPlaceholder(DEFAULT_GLOBAL_NAME).setValue(current);

                text.inputEl.addEventListener("blur", async () => {
                    const name = text.getValue().trim();
                    if (name === current) return;

                    // Пустое поле — возврат к привычному имени, а не отсутствие
                    // переменной: без неё API не достать ниоткуда.
                    const wanted = name === "" ? DEFAULT_GLOBAL_NAME : name;
                    if (!isValidGlobalName(wanted)) {
                        new Notice(
                            t("settings.globalNameBad"),
                        );
                        text.setValue(current);
                        return;
                    }

                    await this.plugin.updateSettings({ globalName: wanted });
                    this.plugin.exposeApi(wanted);
                    new Notice(t("settings.globalNameSet", { name: wanted }));
                    this.display();
                });
            });
    }

    /**
     * Папку можно выбрать из существующих или вписать несуществующую —
     * тогда она будет создана при первой загрузке вложения.
     * Пустое поле означает корень хранилища.
     */
    private renderFolderSetting(
        container: HTMLElement,
        name: string,
        description: string,
        value: string,
        save: (folder: string) => Promise<void>,
    ): void {
        new Setting(container)
            .setName(name)
            .setDesc(description)
            .addText((text) => {
                text.setPlaceholder(t("settings.folderPlaceholder"))
                    .setValue(value)
                    .onChange(async (entered) => {
                        await save(entered.trim());
                    });
                new FolderSuggest(this.app, text.inputEl, async (path) => {
                    await save(path);
                });
            });
    }
}
