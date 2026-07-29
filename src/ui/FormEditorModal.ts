import { App, Modal, Setting, setIcon } from "obsidian";
import { createField, moveField, removeFieldAt, validateFields } from "../core/fields";
import { INPUT_TYPE_LABELS } from "../core/types";
import type { FieldDefinition, FormDefinition } from "../core/types";
import { FieldEditorModal } from "./FieldEditorModal";

interface FormEditorOptions {
    form: FormDefinition;
    onSave: (form: FormDefinition, originalName: string) => void;
}

/**
 * Состав формы: список полей и порядок. Настройка отдельного поля живёт в
 * своём окне — здесь только перечень. Правки применяются к настройкам
 * плагина по кнопке «Сохранить», отмена ничего не меняет.
 */
export class FormEditorModal extends Modal {
    private draft: FormDefinition;
    private readonly originalName: string;
    private fieldsEl: HTMLElement | null = null;
    private errorEl: HTMLElement | null = null;

    constructor(
        app: App,
        private options: FormEditorOptions,
    ) {
        super(app);
        this.draft = structuredClone(options.form);
        this.originalName = options.form.name;
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        modalEl.addClass("mfl-wide-modal");
        contentEl.addClass("mfl-modal");

        contentEl.createEl("h3", { text: `Форма: ${this.draft.title}`, cls: "mfl-title" });

        this.fieldsEl = contentEl.createDiv({ cls: "mfl-fields" });
        this.renderFields();

        new Setting(contentEl).addButton((button) =>
            button.setButtonText("Добавить поле").onClick(() => this.addField()),
        );

        this.errorEl = contentEl.createDiv({ cls: "mfl-error" });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText("Сохранить")
                    .setCta()
                    .onClick(() => this.submit()),
            );
    }

    private addField(): void {
        new FieldEditorModal(this.app, {
            field: createField(this.draft.fields),
            otherFields: this.draft.fields,
            isNew: true,
            onSubmit: (field) => {
                this.draft.fields.push(field);
                this.renderFields();
            },
        }).open();
    }

    private editField(field: FieldDefinition, index: number): void {
        new FieldEditorModal(this.app, {
            field,
            otherFields: this.draft.fields.filter((other) => other !== field),
            onSubmit: (edited) => {
                this.draft.fields[index] = edited;
                this.renderFields();
            },
        }).open();
    }

    private renderFields(): void {
        const container = this.fieldsEl;
        if (!container) return;
        container.empty();
        this.draft.fields.forEach((field, index) => this.renderRow(container, field, index));
        this.clearError();
    }

    private renderRow(container: HTMLElement, field: FieldDefinition, index: number): void {
        const row = container.createDiv({ cls: "mfl-field-row" });

        const caption = row.createDiv({ cls: "mfl-field-caption" });
        caption.createSpan({ text: field.label?.trim() || field.name });
        caption.createSpan({ cls: "mfl-field-type", text: INPUT_TYPE_LABELS[field.input.type] });
        caption.addEventListener("click", () => this.editField(field, index));

        this.iconButton(row, "arrow-up", "Выше", () => {
            this.draft.fields = moveField(this.draft.fields, index, -1);
            this.renderFields();
        });
        this.iconButton(row, "arrow-down", "Ниже", () => {
            this.draft.fields = moveField(this.draft.fields, index, 1);
            this.renderFields();
        });
        this.iconButton(row, "pencil", "Настроить поле", () => this.editField(field, index));
        this.iconButton(row, "trash-2", "Удалить поле", () => {
            this.draft.fields = removeFieldAt(this.draft.fields, index);
            this.renderFields();
        });
    }

    private iconButton(
        parent: HTMLElement,
        icon: string,
        tooltip: string,
        onClick: () => void,
    ): void {
        const button = parent.createDiv({ cls: "clickable-icon", attr: { "aria-label": tooltip } });
        setIcon(button, icon);
        button.addEventListener("click", onClick);
    }

    private clearError(): void {
        if (this.errorEl) this.errorEl.setText("");
    }

    private submit(): void {
        const error = validateFields(this.draft.fields);
        if (error) {
            if (this.errorEl) this.errorEl.setText(error);
            return;
        }

        this.close();
        this.options.onSave(this.draft, this.originalName);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
