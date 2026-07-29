import { Notice, Plugin } from "obsidian";
import { ModalFormsApi } from "./api";
import * as formsRepo from "./core/forms";
import { defaultSettings, parseSettings } from "./core/settings";
import type { FormDefinition, PluginSettings } from "./core/types";
import { ModalFormsSettingTab } from "./settings/SettingsTab";
import { FormMetaModal } from "./ui/FormMetaModal";

declare global {
    interface Window {
        MFL?: ModalFormsApi;
    }
}

export default class ModalFormsLitePlugin extends Plugin {
    settings: PluginSettings = defaultSettings();
    api!: ModalFormsApi;

    async onload(): Promise<void> {
        this.settings = parseSettings(await this.loadData());

        // Формы читаем через функцию, а не передаём массив: он пересоздаётся
        // при каждой правке, и захваченная ссылка быстро протухла бы.
        this.api = new ModalFormsApi(this.app, () => this.settings.forms);
        window.MFL = this.api;

        this.addSettingTab(new ModalFormsSettingTab(this.app, this));

        this.addCommand({
            id: "create-form",
            name: "Создать форму",
            callback: () => this.openCreateFormModal(),
        });
    }

    onunload(): void {
        // Оставлять ссылку на выгруженный плагин в window нельзя.
        delete window.MFL;
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    // === Операции над формами ===
    // Тонкие обёртки: вся логика в core/forms.ts, здесь только сохранение.

    isNameTaken(name: string, exceptName?: string): boolean {
        return formsRepo.isNameTaken(this.settings.forms, name, exceptName);
    }

    async upsertForm(form: FormDefinition, originalName?: string): Promise<void> {
        this.settings.forms = formsRepo.upsertForm(this.settings.forms, form, originalName);
        await this.saveSettings();
    }

    async removeForm(name: string): Promise<void> {
        this.settings.forms = formsRepo.removeForm(this.settings.forms, name);
        await this.saveSettings();
    }

    async duplicateForm(name: string): Promise<void> {
        this.settings.forms = formsRepo.duplicateForm(this.settings.forms, name);
        await this.saveSettings();
    }

    openCreateFormModal(): void {
        new FormMetaModal(this.app, {
            isNameTaken: (name) => this.isNameTaken(name),
            onSubmit: async ({ name, title }) => {
                await this.upsertForm({ name, title, fields: [] });
                new Notice(`Форма «${title}» создана`);
            },
        }).open();
    }
}
