import { App, PluginSettingTab, Setting } from "obsidian";
import type ModalFormsLitePlugin from "../main";
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
    }
}
