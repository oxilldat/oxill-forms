import { App, Modal, Setting, setIcon } from "obsidian";
import { createField, moveField, removeFieldAt, validateFields } from "../core/fields";
import { INPUT_TYPE_LABELS } from "../core/types";
import type { EditorContext, FieldDefinition, FormDefinition } from "../core/types";
import { ConfirmModal } from "./ConfirmModal";
import { FieldEditor } from "./FieldEditor";

interface FormEditorOptions {
    form: FormDefinition;
    context: EditorContext;
    onSave: (form: FormDefinition, originalName: string) => void;
}

/**
 * Состав формы: список полей, порядок и настройки каждого. Настройки поля
 * разворачиваются прямо в строке — отдельного окна нет, иначе на каждое
 * поле приходилось бы открывать и закрывать ещё одно окно поверх двух.
 *
 * Правки применяются к настройкам плагина по кнопке «Сохранить».
 */
export class FormEditorModal extends Modal {
    private draft: FormDefinition;
    private readonly originalName: string;
    /** Слепок при открытии — по нему понимаем, были ли правки. */
    private readonly snapshot: string;
    private mayClose = false;
    /**
     * Развёрнутые строки храним по ссылке на поле, а не по номеру: при
     * перестановке номер уехал бы на соседа.
     */
    private expanded = new Set<FieldDefinition>();
    /**
     * Имя поля на момент открытия. Нужно, чтобы на сохранении понять, какие
     * поля переименованы, и починить заметки. Новых полей в карте нет.
     */
    private originalNames = new WeakMap<FieldDefinition, string>();
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

        for (const field of this.draft.fields) this.originalNames.set(field, field.name);
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
        const field = createField(this.draft.fields);
        this.draft.fields.push(field);
        // Новое поле сразу раскрыто: его всё равно нужно настраивать.
        this.expanded.add(field);
        this.renderFields();
    }

    private renderFields(): void {
        const container = this.fieldsEl;
        if (!container) return;
        container.empty();
        this.draft.fields.forEach((field, index) => this.renderRow(container, field, index));
        this.clearError();
    }

    private renderRow(container: HTMLElement, field: FieldDefinition, index: number): void {
        const block = container.createDiv({ cls: "mfl-field-block" });
        const header = block.createDiv({ cls: "mfl-field-header" });

        const isOpen = this.expanded.has(field);
        // Развёрнутый блок теряет заливку: внутри лежат карточки настроек,
        // и на одинаковом фоне они бы не читались.
        block.toggleClass("is-open", isOpen);
        const chevron = header.createDiv({ cls: "clickable-icon" });
        setIcon(chevron, isOpen ? "chevron-down" : "chevron-right");
        chevron.addEventListener("click", () => {
            if (isOpen) this.expanded.delete(field);
            else this.expanded.add(field);
            this.renderFields();
        });

        const caption = header.createDiv({ cls: "mfl-field-caption" });
        caption.createSpan({ text: field.label?.trim() || field.name });
        caption.createSpan({ cls: "mfl-field-type", text: INPUT_TYPE_LABELS[field.input.type] });
        caption.addEventListener("click", () => chevron.click());

        this.iconButton(header, "arrow-up", "Выше", () => {
            this.draft.fields = moveField(this.draft.fields, index, -1);
            this.renderFields();
        });
        this.iconButton(header, "arrow-down", "Ниже", () => {
            this.draft.fields = moveField(this.draft.fields, index, 1);
            this.renderFields();
        });
        this.iconButton(header, "trash-2", "Удалить поле", () => {
            this.expanded.delete(field);
            this.draft.fields = removeFieldAt(this.draft.fields, index);
            this.renderFields();
        });

        if (!isOpen) return;

        const body = block.createDiv({ cls: "mfl-field-body" });
        new FieldEditor(this.app, {
            field,
            otherFields: this.draft.fields.filter((other) => other !== field),
            context: this.options.context,
            onChange: () => this.clearError(),
        }).render(body);
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

    /** Подчищает то, что пользователь мог оставить неаккуратным. */
    private normalize(): void {
        for (const field of this.draft.fields) {
            field.name = field.name.trim();

            const input = field.input;
            if (input.type !== "select" && input.type !== "multiselect") continue;
            if (input.source !== "fixed") continue;

            for (const option of input.options) {
                option.value = option.value.trim();
                // Пустая подпись — не ошибка: показываем само значение.
                if (option.label.trim() === "") option.label = option.value;
            }
        }
    }

    /**
     * Переименования выводим сравнением с именами на момент открытия. Так
     * перестановка и удаление полей не путают карту: она держит сами поля,
     * а не их номера.
     */
    private collectRenames(): { from: string; to: string }[] {
        const renames: { from: string; to: string }[] = [];
        for (const field of this.draft.fields) {
            const before = this.originalNames.get(field);
            if (before !== undefined && before !== field.name) {
                renames.push({ from: before, to: field.name });
            }
        }
        return renames;
    }

    private submit(): void {
        this.normalize();

        const error = validateFields(this.draft.fields);
        if (error) {
            if (this.errorEl) this.errorEl.setText(error);
            return;
        }

        // Версию поднимаем только при переименованиях: именно они расходятся
        // с уже созданными заметками. Прочие правки заметок не касаются.
        const renames = this.collectRenames();
        if (renames.length > 0) {
            const version = this.draft.version + 1;
            this.draft.version = version;
            this.draft.renames = [
                ...(this.draft.renames ?? []),
                ...renames.map((rename) => ({ ...rename, version })),
            ];
        }

        this.mayClose = true;
        this.close();
        this.options.onSave(this.draft, this.originalName);
    }

    private isDirty(): boolean {
        return JSON.stringify(this.draft) !== this.snapshot;
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
