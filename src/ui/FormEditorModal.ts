import { App, Modal, Setting, setIcon } from "obsidian";
import { createField, moveField, removeFieldAt, validateFields } from "../core/fields";
import { INPUT_TYPE_LABELS } from "../core/types";
import type { EditorContext, FieldDefinition, FormDefinition } from "../core/types";
import { ConfirmModal } from "./ConfirmModal";
import { FieldEditorModal } from "./FieldEditorModal";

interface FormEditorOptions {
    form: FormDefinition;
    context: EditorContext;
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
    /** Слепок при открытии — по нему понимаем, были ли правки. */
    private readonly snapshot: string;
    private mayClose = false;
    /** Переименования, накопленные за этот сеанс правки. */
    private pendingRenames: { from: string; to: string }[] = [];
    private fieldsEl: HTMLElement | null = null;
    private errorEl: HTMLElement | null = null;

    constructor(
        app: App,
        private options: FormEditorOptions,
    ) {
        super(app);
        this.draft = structuredClone(options.form);
        this.originalName = options.form.name;
        this.snapshot = JSON.stringify(this.draft);
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
            context: this.options.context,
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
            context: this.options.context,
            onSubmit: (edited, previousName) => {
                this.draft.fields[index] = edited;
                if (previousName !== undefined) this.recordRename(previousName, edited.name);
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

        // Версию поднимаем только при переименованиях: именно они расходятся
        // с уже созданными заметками. Прочие правки заметок не касаются.
        if (this.pendingRenames.length > 0) {
            const version = this.draft.version + 1;
            this.draft.version = version;
            this.draft.renames = [
                ...(this.draft.renames ?? []),
                ...this.pendingRenames.map((rename) => ({ ...rename, version })),
            ];
        }

        this.mayClose = true;
        this.close();
        this.options.onSave(this.draft, this.originalName);
    }

    /**
     * Копит переименования за сеанс правки. Цепочку a → b → c сворачиваем в
     * a → c, а возврат к исходному имени убираем совсем: заметки в этих
     * случаях чинить не нужно.
     */
    private recordRename(from: string, to: string): void {
        const chained = this.pendingRenames.find((rename) => rename.to === from);
        if (chained) {
            chained.to = to;
        } else {
            this.pendingRenames.push({ from, to });
        }
        this.pendingRenames = this.pendingRenames.filter((rename) => rename.from !== rename.to);
    }

    private isDirty(): boolean {
        return JSON.stringify(this.draft) !== this.snapshot || this.pendingRenames.length > 0;
    }

    /**
     * Крестик, Escape и клик мимо окна приходят сюда. Если правки есть и они
     * не сохранены — сначала спрашиваем, потому что терять их молча нельзя.
     */
    close(): void {
        if (this.mayClose || !this.options.context.confirmDiscard || !this.isDirty()) {
            super.close();
            return;
        }

        new ConfirmModal(this.app, {
            title: "Закрыть без сохранения?",
            message:
                "Изменения в составе полей не сохранены и будут потеряны. " +
                "Вернитесь и нажмите «Сохранить», чтобы их оставить.",
            icon: "alert-triangle",
            danger: true,
            confirmText: "Закрыть без сохранения",
            cancelText: "Вернуться к правке",
            onConfirm: () => {
                this.mayClose = true;
                this.close();
            },
        }).open();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
