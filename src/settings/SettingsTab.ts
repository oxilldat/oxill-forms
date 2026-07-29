import { App, PluginSettingTab, Setting } from "obsidian";
import { isDataviewAvailable } from "../core/dataview";
import type ModalFormsLitePlugin from "../main";
import { FolderSuggest } from "../ui/FolderSuggest";
import { FormListModal } from "../ui/FormListModal";

export class ModalFormsSettingTab extends PluginSettingTab {
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
