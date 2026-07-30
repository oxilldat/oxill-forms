import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { isDataviewAvailable } from "../core/dataview";
import { applyNoteUpdates, scanNotes } from "../core/noteMigration";
import type { NoteUpdate } from "../core/noteMigration";
import type ModalFormsLitePlugin from "../main";
import { FolderSuggest } from "../ui/FolderSuggest";
import { FormListModal } from "../ui/FormListModal";

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
            .setHeading()
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

        const names = this.found.map((update) => update.file.path);
        const preview = names.slice(0, 5).join(", ");
        setting.setDesc(
            `Найдено: ${names.length}. ${preview}${names.length > 5 ? " и другие" : ""}`,
        );

        setting.addButton((button) =>
            button.setButtonText("Отмена").onClick(() => {
                this.found = null;
                this.display();
            }),
        );

        setting.addButton((button) =>
            button
                .setButtonText(`Обновить заметки (${names.length})`)
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
