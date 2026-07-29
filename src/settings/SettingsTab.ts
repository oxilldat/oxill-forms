import { App, PluginSettingTab, Setting } from "obsidian";
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
