import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { isDataviewAvailable } from "../core/dataview";
import { bundleToJson } from "../core/exchange";
import { freeName } from "../core/forms";
import { createNote } from "../core/vault";
import { applyNoteUpdates, scanNotes } from "../core/noteMigration";
import type { NoteUpdate } from "../core/noteMigration";
import type ModalFormsLitePlugin from "../main";
import { FolderSuggest } from "../ui/FolderSuggest";
import { FormListModal } from "../ui/FormListModal";
import { ImportFormModal } from "../ui/ImportFormModal";

export class ModalFormsSettingTab extends PluginSettingTab {
    /** Результат последнего сканирования: null — ещё не искали. */
    private found: NoteUpdate[] | null = null;

    constructor(
        app: App,
        private plugin: ModalFormsLitePlugin,
    ) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Формы")
            .setDesc("Формы хранятся в настройках плагина и вызываются по идентификатору")
            .setHeading();

        new Setting(containerEl)
            .setName("Браузер форм")
            .setDesc("Список форм с папками и карточками: правка, дублирование, удаление")
            .addButton((button) =>
                button
                    .setButtonText("Список форм")
                    .onClick(() => new FormListModal(this.app, this.plugin).open()),
            )
            .addButton((button) =>
                button
                    .setButtonText("Создать форму")
                    .setCta()
                    .onClick(() => this.plugin.openCreateFormModal()),
            );

        this.renderImportSetting();
        this.renderExportSetting();

        new Setting(containerEl).setName("Вложения").setHeading();

        this.renderFolderSetting(
            "Место сохранения фотографий",
            "Куда попадают JPEG, PNG и WebP из полей типа «Изображение»",
            this.plugin.settings.imageFolder,
            (folder) => this.plugin.updateSettings({ imageFolder: folder }),
        );

        this.renderFolderSetting(
            "Место сохранения файлов",
            "Куда попадает всё остальное из полей типа «Файл»",
            this.plugin.settings.fileFolder,
            (folder) => this.plugin.updateSettings({ fileFolder: folder }),
        );

        new Setting(containerEl).setName("Дополнительно").setHeading();

        new Setting(containerEl)
            .setName("Не спрашивать при закрытии без сохранения")
            .setDesc(
                "Редактор формы и редактор поля будут закрываться сразу. " +
                    "Несохранённые правки при этом теряются без предупреждения",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.skipDiscardConfirm)
                    .onChange((value) =>
                        this.plugin.updateSettings({ skipDiscardConfirm: value }),
                    ),
            );

        this.renderDataviewSetting();

        new Setting(containerEl).setName("Заметки").setHeading();

        new Setting(containerEl)
            .setName("Автоматически обновлять заметки при изменении формы")
            .setDesc(
                "Если переименовать поле, плагин сразу переименует ключ во frontmatter " +
                    "заметок, созданных этой формой",
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
        if (!this.plugin.settings.autoUpdateNotes) this.renderScanSetting();
    }

    /**
     * Две стадии в одной кнопке: сначала поиск, потом применение найденного.
     * Разделено намеренно — правка frontmatter необратима, и увидеть объём
     * до применения важнее, чем сэкономить нажатие.
     */
    private renderScanSetting(): void {
        const setting = new Setting(this.containerEl).setName("Заметки со старыми полями");

        if (this.found === null) {
            setting.setDesc("Проверить, остались ли заметки с прежними названиями полей");
            setting.addButton((button) =>
                button.setButtonText("Сканировать хранилище").onClick(() => {
                    const found = scanNotes(this.app, this.plugin.settings.forms);
                    if (found.length === 0) {
                        new Notice("Заметок со старыми полями не найдено");
                        return;
                    }
                    this.found = found;
                    this.display();
                }),
            );
            return;
        }

        const count = this.found.length;
        setting.setDesc("Заметки с прежними названиями полей готовы к обновлению");

        setting.addButton((button) =>
            button.setButtonText("Отмена").onClick(() => {
                this.found = null;
                this.display();
            }),
        );

        setting.addButton((button) =>
            button
                .setButtonText(`Обновить заметки (${count})`)
                .setCta()
                .onClick(async () => {
                    const updates = this.found ?? [];
                    this.found = null;
                    const { changed, failed } = await applyNoteUpdates(this.app, updates);
                    new Notice(`Обновлено заметок: ${changed}`);
                    if (failed.length > 0) {
                        new Notice(`Не удалось обновить: ${failed.length}. Подробности в консоли`);
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

                new Notice(`Импортировано форм: ${forms.length}`);
                if (renamed.length > 0) {
                    new Notice(`Занятые имена переименованы: ${renamed.join(", ")}`);
                }
            },
        }).open();
    }

    /** Импорт форм из конверта — отдельной строкой, в пару к экспорту. */
    private renderImportSetting(): void {
        new Setting(this.containerEl)
            .setName("Импорт форм")
            .setDesc("Вставить конверт форм из другого хранилища")
            .addButton((button) =>
                button.setButtonText("Импортировать").onClick(() => this.importForm()),
            );
    }

    /** Экспорт всех форм разом: перенос в другое хранилище одним движением. */
    private renderExportSetting(): void {
        const forms = this.plugin.settings.forms;

        const setting = new Setting(this.containerEl)
            .setName("Экспорт всех форм")
            .setDesc(`В конверт попадут все формы (${forms.length}) и версия плагина`);

        if (forms.length === 0) {
            setting.setDesc("Экспортировать пока нечего — форм нет");
            return;
        }

        setting.addButton((button) =>
            button.setButtonText("В буфер").onClick(async () => {
                try {
                    await navigator.clipboard.writeText(
                        bundleToJson(forms, this.plugin.manifest.version),
                    );
                    new Notice(`Скопировано форм: ${forms.length}`);
                } catch (error) {
                    console.error("[modal-forms-lite] не удалось скопировать формы", error);
                    new Notice("Не удалось обратиться к буферу обмена");
                }
            }),
        );

        setting.addButton((button) =>
            button.setButtonText("В заметку").onClick(async () => {
                const json = bundleToJson(forms, this.plugin.manifest.version);
                const stamp = new Date().toISOString().slice(0, 10);
                const content = `# Формы Modal Forms Lite\n\nЭкспорт от ${stamp}.\n\n\`\`\`json\n${json}\n\`\`\`\n`;

                try {
                    const file = await createNote(this.app, "", `Формы ${stamp}`, content);
                    await this.app.workspace.getLeaf(false).openFile(file);
                } catch (error) {
                    console.error("[modal-forms-lite] не удалось создать заметку", error);
                    new Notice("Не удалось создать заметку с экспортом");
                }
            }),
        );
    }

    /**
     * Переключатель полей Dataview. Если самого плагина нет, включать нечего —
     * запрос всё равно не выполнить, поэтому переключатель блокируем.
     */
    private renderDataviewSetting(): void {
        const available = isDataviewAvailable(this.app);

        const setting = new Setting(this.containerEl)
            .setName("Разрешить поля «Список из запроса Dataview»")
            .setDesc(
                available
                    ? "Плагин Dataview найден. Учтите: такие поля исполняют написанный вами JS-код"
                    : "Плагин Dataview не установлен или отключён — включать нечего",
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
     * Папку можно выбрать из существующих или вписать несуществующую —
     * тогда она будет создана при первой загрузке вложения.
     * Пустое поле означает корень хранилища.
     */
    private renderFolderSetting(
        name: string,
        description: string,
        value: string,
        save: (folder: string) => Promise<void>,
    ): void {
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(description)
            .addText((text) => {
                text.setPlaceholder("Корень хранилища")
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
