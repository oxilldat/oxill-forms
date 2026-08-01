import { App, Modal, Setting, setIcon } from "obsidian";
import {
    createField,
    duplicateField,
    moveField,
    removeFieldAt,
    reorderField,
    validateFields,
} from "../core/fields";
import { inputTypeLabel } from "../core/labels";
import { t } from "../i18n";
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
    /** Номер поля, которое сейчас тащат. */
    private dragging: number | null = null;
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
        modalEl.addClass("oxf-wide-modal");
        contentEl.addClass("oxf-modal");

        contentEl.createEl("h3", { text: t("editor.title", { title: this.draft.title }), cls: "oxf-title" });

        this.fieldsEl = contentEl.createDiv({ cls: "oxf-fields" });
        this.renderFields();

        new Setting(contentEl).addButton((button) =>
            button.setButtonText(t("editor.addField")).onClick(() => this.addField()),
        );

        this.errorEl = contentEl.createDiv({ cls: "oxf-error" });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText(t("common.cancel")).onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText(t("common.save"))
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
        const block = container.createDiv({ cls: "oxf-field-block" });
        const header = block.createDiv({ cls: "oxf-field-header" });

        // Место, куда встанет поле при броске. Полоса рисуется поверх стыка,
        // поэтому список не дёргается, пока водишь мышью.
        this.acceptFieldDrop(block, index);

        // Тащим только за ручку: развёрнутое поле занимает пол-окна, и
        // перетаскивание всего блока мешало бы просто кликать по настройкам.
        const handle = header.createDiv({
            cls: "oxf-field-handle",
            attr: { "aria-label": t("editor.drag"), draggable: "true" },
        });
        setIcon(handle, "grip-vertical");
        handle.addEventListener("dragstart", (event) => {
            this.dragging = index;
            block.addClass("is-dragging");
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", field.name);
                // Иначе браузер утащит картинку одной только ручки.
                event.dataTransfer.setDragImage(block, 12, 12);
            }
        });
        handle.addEventListener("dragend", () => {
            this.dragging = null;
            block.removeClass("is-dragging");
            this.clearDropMarks();
        });

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

        const caption = header.createDiv({ cls: "oxf-field-caption" });
        caption.createSpan({ text: field.label?.trim() || field.name });
        caption.createSpan({ cls: "oxf-field-type", text: inputTypeLabel(field.input.type) });
        caption.addEventListener("click", () => chevron.click());

        this.iconButton(header, "arrow-up", t("editor.up"), () => {
            this.draft.fields = moveField(this.draft.fields, index, -1);
            this.renderFields();
        });
        this.iconButton(header, "arrow-down", t("editor.down"), () => {
            this.draft.fields = moveField(this.draft.fields, index, 1);
            this.renderFields();
        });
        this.iconButton(header, "copy", t("editor.duplicate"), () => {
            this.draft.fields = duplicateField(this.draft.fields, index);
            // Копия сразу раскрыта: её всё равно надо править — ради этого
            // её и делают.
            const copy = this.draft.fields[index + 1];
            if (copy) this.expanded.add(copy);
            this.renderFields();
        });
        this.iconButton(header, "trash-2", t("editor.deleteField"), () => {
            this.expanded.delete(field);
            this.draft.fields = removeFieldAt(this.draft.fields, index);
            this.renderFields();
        });

        if (!isOpen) return;

        const body = block.createDiv({ cls: "oxf-field-body" });
        new FieldEditor(this.app, {
            field,
            otherFields: this.draft.fields.filter((other) => other !== field),
            context: this.options.context,
            onChange: () => this.clearError(),
        }).render(body);
    }

    /**
     * Делает блок поля целью броска. Куда именно встанет перетаскиваемое —
     * решает половина блока, над которой курсор: выше середины значит «перед»,
     * ниже — «после». Без этого нельзя положить поле в самый конец списка.
     */
    private acceptFieldDrop(block: HTMLElement, index: number): void {
        const targetIndex = (event: DragEvent): number => {
            const box = block.getBoundingClientRect();
            return event.clientY < box.top + box.height / 2 ? index : index + 1;
        };

        block.addEventListener("dragover", (event) => {
            if (this.dragging === null) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";

            this.clearDropMarks();
            block.addClass(targetIndex(event) === index ? "is-drop-before" : "is-drop-after");
        });

        block.addEventListener("dragleave", (event) => {
            const to = event.relatedTarget;
            if (to instanceof Node && block.contains(to)) return;
            block.removeClass("is-drop-before");
            block.removeClass("is-drop-after");
        });

        block.addEventListener("drop", (event) => {
            event.preventDefault();
            const from = this.dragging;
            this.dragging = null;
            this.clearDropMarks();
            if (from === null) return;

            this.draft.fields = reorderField(this.draft.fields, from, targetIndex(event));
            this.renderFields();
        });
    }

    private clearDropMarks(): void {
        const blocks = this.fieldsEl?.querySelectorAll(".oxf-field-block");
        blocks?.forEach((el) => {
            el.removeClass("is-drop-before");
            el.removeClass("is-drop-after");
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

    /** Подчищает то, что пользователь мог оставить неаккуратным. */
    private normalize(): void {
        for (const field of this.draft.fields) {
            field.name = field.name.trim();

            const input = field.input;
            if (input.type !== "select" && input.type !== "multiselect") continue;

            // Пустые и повторяющиеся папки-источники: пустая строка осталась
            // от нажатия «Добавить папку», а повтор дал бы каждую заметку дважды.
            if (input.type === "multiselect" && input.source === "notes") {
                const extra = (input.folders ?? [])
                    .map((folder) => folder.trim())
                    .filter(
                        (folder, index, all) =>
                            folder !== "" &&
                            folder !== input.folder.trim() &&
                            all.indexOf(folder) === index,
                    );
                if (extra.length === 0) delete input.folders;
                else input.folders = extra;
                continue;
            }

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
            title: t("editor.discardTitle"),
            message:
                t("editor.discardText"),
            icon: "alert-triangle",
            danger: true,
            confirmText: t("editor.discardConfirm"),
            cancelText: t("editor.discardCancel"),
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
