import { App, Modal, Notice, Setting } from "obsidian";
import { bundleToJson } from "../core/exchange";
import { plural } from "../core/forms";
import { isValidName } from "../core/naming";
import type { FormDefinition } from "../core/types";
import type ModalFormsLitePlugin from "../main";
import { ConfirmModal } from "./ConfirmModal";
import { FormEditorModal } from "./FormEditorModal";
import { FormMetaModal } from "./FormMetaModal";

/**
 * Перечень сохранённых форм с действиями над ними. Живёт в отдельном окне,
 * чтобы вкладка настроек не разрасталась вместе с числом форм.
 */
export class FormListModal extends Modal {
    private listEl: HTMLElement | null = null;

    constructor(
        app: App,
        private plugin: ModalFormsLitePlugin,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        modalEl.addClass("mfl-wide-modal");
        contentEl.addClass("mfl-modal");
        contentEl.createEl("h3", { text: "Формы", cls: "mfl-title" });

        this.listEl = contentEl.createDiv();
        this.renderList();
    }

    private renderList(): void {
        const container = this.listEl;
        if (!container) return;
        container.empty();
        for (const form of this.plugin.settings.forms) {
            this.renderRow(container, form);
        }
    }

    private renderRow(container: HTMLElement, form: FormDefinition): void {
        const fieldCount = plural(form.fields.length, "поле", "поля", "полей");

        // Имя могло приехать из отредактированного руками data.json — такие
        // формы не выбрасываем, а помечаем, чтобы их переименовали.
        const description = createFragment((fragment) => {
            fragment.appendText(`${form.name} · ${fieldCount}`);
            if (!isValidName(form.name)) {
                fragment.createDiv({
                    cls: "mfl-warning",
                    text: "Идентификатор содержит недопустимые символы — переименуйте форму",
                });
            }
        });

        new Setting(container)
            .setName(form.title)
            .setDesc(description)
            .addToggle((toggle) =>
                toggle
                    .setTooltip("Команда «Заполнить» в палитре команд")
                    .setValue(form.command?.enabled === true)
                    .onChange(async (value) => {
                        await this.plugin.setFormCommand(form.name, value);
                        this.renderList();
                    }),
            )
            .addExtraButton((button) =>
                button
                    .setIcon("pencil")
                    .setTooltip("Свойства формы")
                    .onClick(() => this.editMeta(form)),
            )
            .addExtraButton((button) =>
                button
                    .setIcon("settings")
                    .setTooltip("Настройка полей")
                    .onClick(() => this.editFields(form)),
            )
            .addExtraButton((button) =>
                button
                    .setIcon("copy")
                    .setTooltip("Дублировать")
                    .onClick(async () => {
                        await this.plugin.duplicateForm(form.name);
                        this.renderList();
                    }),
            )
            .addExtraButton((button) =>
                button
                    .setIcon("clipboard-copy")
                    .setTooltip("Экспорт: скопировать JSON формы")
                    .onClick(() => void this.exportForm(form)),
            )
            .addExtraButton((button) =>
                button
                    .setIcon("trash-2")
                    .setTooltip("Удалить")
                    .onClick(() => this.deleteForm(form)),
            );
    }

    /** Экспорт одной формы: конверт с версией плагина в буфер обмена. */
    private async exportForm(form: FormDefinition): Promise<void> {
        try {
            await navigator.clipboard.writeText(
                bundleToJson([form], this.plugin.manifest.version),
            );
            new Notice(`Форма «${form.title}» скопирована в буфер обмена`);
        } catch (error) {
            console.error("[modal-forms-lite] не удалось скопировать форму", error);
            new Notice("Не удалось обратиться к буферу обмена");
        }
    }

    private editMeta(form: FormDefinition): void {
        new FormMetaModal(this.app, {
            form,
            isNameTaken: (name) => this.plugin.isNameTaken(name, form.name),
            onSubmit: async ({ name, title, command }) => {
                await this.plugin.upsertForm({ ...form, name, title, command }, form.name);
                this.renderList();
            },
        }).open();
    }

    private editFields(form: FormDefinition): void {
        new FormEditorModal(this.app, {
            form,
            context: this.plugin.editorContext(),
            onSave: async (edited, originalName) => {
                await this.plugin.upsertForm(edited, originalName);
                this.renderList();
            },
        }).open();
    }

    private deleteForm(form: FormDefinition): void {
        new ConfirmModal(this.app, {
            title: "Удалить форму?",
            message: `Форма «${form.title}» будет удалена без возможности восстановления.`,
            danger: true,
            onConfirm: async () => {
                await this.plugin.removeForm(form.name);
                this.renderList();
            },
        }).open();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
