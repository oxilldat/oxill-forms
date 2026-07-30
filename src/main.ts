import { App, Notice, Plugin } from "obsidian";
import { ModalFormsApi } from "./api";
import { isDataviewAvailable } from "./core/dataview";
import * as formsRepo from "./core/forms";
import { applyNoteUpdates, scanNotes } from "./core/noteMigration";
import { defaultSettings, parseSettings } from "./core/settings";
import type { EditorContext, FormDefinition, PluginSettings } from "./core/types";
import { ModalFormsSettingTab } from "./settings/SettingsTab";
import { FormMetaModal } from "./ui/FormMetaModal";

declare global {
    interface Window {
        MFL?: ModalFormsApi;
    }
}

/** Внутренний реестр команд Obsidian — в публичных типах его нет. */
interface CommandRegistry {
    commands?: { removeCommand?: (id: string) => void };
}

export default class ModalFormsLitePlugin extends Plugin {
    settings: PluginSettings = defaultSettings();
    api!: ModalFormsApi;
    /** Имена форм, для которых сейчас зарегистрирована команда. */
    private formCommands = new Set<string>();

    async onload(): Promise<void> {
        this.settings = parseSettings(await this.loadData());

        // Настройки читаем через функцию, а не передаём объект: он
        // пересоздаётся при каждой правке, и захваченная ссылка протухла бы.
        this.api = new ModalFormsApi(this.app, () => this.settings);
        window.MFL = this.api;

        this.addSettingTab(new ModalFormsSettingTab(this.app, this));

        this.addCommand({
            id: "create-form",
            name: "Создать форму",
            callback: () => this.openCreateFormModal(),
        });

        this.syncFormCommands();
    }

    onunload(): void {
        // Оставлять ссылку на выгруженный плагин в window нельзя.
        delete window.MFL;
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /** Точечная правка настроек: передаём только изменившиеся поля. */
    async updateSettings(patch: Partial<PluginSettings>): Promise<void> {
        this.settings = { ...this.settings, ...patch };
        await this.saveSettings();
    }

    /**
     * Собирается заново на каждое открытие редактора: и настройки, и наличие
     * Dataview могли поменяться с прошлого раза.
     */
    editorContext(): EditorContext {
        return {
            allowDataview: this.settings.dataviewEnabled && isDataviewAvailable(this.app),
            confirmDiscard: !this.settings.skipDiscardConfirm,
        };
    }

    // === Операции над формами ===
    // Тонкие обёртки: вся логика в core/forms.ts, здесь только сохранение.

    isNameTaken(name: string, exceptName?: string): boolean {
        return formsRepo.isNameTaken(this.settings.forms, name, exceptName);
    }

    async upsertForm(form: FormDefinition, originalName?: string): Promise<void> {
        this.settings.forms = formsRepo.upsertForm(this.settings.forms, form, originalName);
        await this.saveSettings();
        this.syncFormCommands();

        if (this.settings.autoUpdateNotes) await this.updateNotesFor(form);
    }

    /**
     * Приводит frontmatter заметок в соответствие с переименованными полями.
     * Идемпотентно: заметку с уже новым ключом поиск не находит, так что
     * повторный вызов ничего не делает.
     */
    async updateNotesFor(form: FormDefinition): Promise<void> {
        if ((form.renames ?? []).length === 0) return;

        const updates = scanNotes(this.app, [form]);
        if (updates.length === 0) return;

        const { changed, failed } = await applyNoteUpdates(this.app, updates);
        if (changed > 0) {
            new Notice(`Обновлено заметок: ${changed}`);
        }
        if (failed.length > 0) {
            new Notice(`Не удалось обновить: ${failed.length}. Подробности в консоли`);
        }
    }

    async removeForm(name: string): Promise<void> {
        this.settings.forms = formsRepo.removeForm(this.settings.forms, name);
        await this.saveSettings();
        this.syncFormCommands();
    }

    async duplicateForm(name: string): Promise<void> {
        this.settings.forms = formsRepo.duplicateForm(this.settings.forms, name);
        await this.saveSettings();
        this.syncFormCommands();
    }

    /** Включает или выключает команду формы в палитре. */
    async setFormCommand(name: string, enabled: boolean): Promise<void> {
        const form = formsRepo.findForm(this.settings.forms, name);
        if (!form) return;
        await this.upsertForm({ ...form, command: enabled }, name);
    }

    // === Команды форм ===

    /**
     * Приводит набор зарегистрированных команд в соответствие с настройками.
     * Вызывается после любой правки форм: переименование или снятие галочки
     * иначе оставило бы в палитре команду-призрак.
     */
    private syncFormCommands(): void {
        const wanted = new Set(
            this.settings.forms.filter((form) => form.command === true).map((form) => form.name),
        );

        for (const name of [...this.formCommands]) {
            if (!wanted.has(name)) this.removeFormCommand(name);
        }
        for (const name of wanted) {
            if (!this.formCommands.has(name)) this.addFormCommand(name);
        }
    }

    private addFormCommand(name: string): void {
        const form = formsRepo.findForm(this.settings.forms, name);
        if (!form) return;

        this.addCommand({
            id: `fill-${name}`,
            name: `Заполнить: ${form.title}`,
            // editorCallback — команда видна только когда открыт редактор:
            // результат вставляется по месту курсора, без заметки некуда.
            editorCallback: (editor) => {
                this.api.openForm(name).then((result) => {
                    if (!result.ok) return;
                    editor.replaceSelection(result.asDataview());
                });
            },
        });
        this.formCommands.add(name);
    }

    /**
     * Публичного способа убрать команду у Plugin нет, а перерегистрация с тем
     * же идентификатором её не удаляет. Пользуемся внутренним реестром, но
     * аккуратно: если его не окажется, честно говорим про перезагрузку.
     */
    private removeFormCommand(name: string): void {
        this.formCommands.delete(name);

        const registry = (this.app as App & CommandRegistry).commands;
        const fullId = `${this.manifest.id}:fill-${name}`;
        if (typeof registry?.removeCommand === "function") {
            registry.removeCommand(fullId);
            return;
        }
        new Notice("Команда исчезнет из палитры после перезапуска Obsidian");
    }

    openCreateFormModal(): void {
        new FormMetaModal(this.app, {
            isNameTaken: (name) => this.isNameTaken(name),
            onSubmit: async ({ name, title }) => {
                await this.upsertForm({ name, title, version: 1, fields: [] });
                new Notice(`Форма «${title}» создана`);
            },
        }).open();
    }
}
