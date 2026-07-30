import { App, Notice, Plugin } from "obsidian";
import { ModalFormsApi } from "./api";
import { sanitizeFileName } from "./core/attachments";
import { isDataviewAvailable } from "./core/dataview";
import * as formsRepo from "./core/forms";
import { applyNoteUpdates, scanNotes } from "./core/noteMigration";
import { defaultSettings, parseSettings } from "./core/settings";
import { createNote } from "./core/vault";
import type { FormResult } from "./core/FormResult";
import type {
    EditorContext,
    FormCommand,
    FormDefinition,
    OutputFormat,
    PluginSettings,
} from "./core/types";
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

function formatResult(result: FormResult, format: OutputFormat): string {
    switch (format) {
        case "frontmatter":
            return result.asFrontmatter();
        case "dataview":
            return result.asDataview();
        case "list":
            return result.asList();
    }
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

    /** Быстрый переключатель команды из списка форм. */
    async setFormCommand(name: string, enabled: boolean): Promise<void> {
        const form = formsRepo.findForm(this.settings.forms, name);
        if (!form) return;

        const command: FormCommand = form.command
            ? { ...form.command, enabled }
            : { enabled, mode: "insert", format: "dataview" };

        await this.upsertForm({ ...form, command }, name);
    }

    // === Команды форм ===

    /**
     * Приводит набор зарегистрированных команд в соответствие с настройками.
     * Вызывается после любой правки форм: переименование или снятие галочки
     * иначе оставило бы в палитре команду-призрак.
     */
    private syncFormCommands(): void {
        const wanted = new Set(
            this.settings.forms
                .filter((form) => form.command?.enabled === true)
                .map((form) => form.name),
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
        const command = form?.command;
        if (!form || !command?.enabled) return;

        if (command.mode === "create") {
            this.addCommand({
                id: `fill-${name}`,
                name: `Заполнить: ${form.title}`,
                // Заметку создаём сами, поэтому открытый редактор не нужен.
                callback: () => void this.createNoteFromForm(form, command),
            });
        } else {
            this.addCommand({
                id: `fill-${name}`,
                name: `Заполнить: ${form.title}`,
                // editorCallback — команда видна только когда открыт редактор:
                // вставлять результат больше некуда.
                editorCallback: (editor) => {
                    // Курсор стоит в заметке — значит её шапка и есть то, что
                    // пользователь собирается дополнить или поправить.
                    this.api.openForm(name, { fromNote: true }).then((result) => {
                        if (!result.ok) return;
                        editor.replaceSelection(formatResult(result, command.format));
                    });
                },
            });
        }
        this.formCommands.add(name);
    }

    /** Режим «создать заметку»: спросить форму, сложить файл, открыть его. */
    private async createNoteFromForm(form: FormDefinition, command: FormCommand): Promise<void> {
        const result = await this.api.openForm(form.name);
        if (!result.ok) return;

        const fromField = command.nameField
            ? String(result.get(command.nameField, "")).trim()
            : "";
        const baseName = sanitizeFileName(fromField === "" ? form.title : fromField);

        const body = formatResult(result, command.format);
        const content =
            command.format === "frontmatter"
                ? `---\n${body}\n---\n\n# ${baseName}\n`
                : `# ${baseName}\n\n${body}\n`;

        try {
            const file = await createNote(this.app, command.folder ?? "", baseName, content);
            await this.app.workspace.getLeaf(false).openFile(file);
        } catch (error) {
            console.error("[modal-forms-lite] не удалось создать заметку", error);
            new Notice("Не удалось создать заметку. Подробности в консоли");
        }
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
            onSubmit: async ({ name, title, command }) => {
                await this.upsertForm({ name, title, version: 1, command, fields: [] });
                new Notice(`Форма «${title}» создана`);
            },
        }).open();
    }
}
