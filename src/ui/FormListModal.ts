import { App, Modal, Notice, setIcon } from "obsidian";
import { bundleToJson } from "../core/exchange";
import {
    DEFAULT_FORM_ICON,
    folderExists,
    folderNames,
    formsInFolder,
    groupByFolder,
} from "../core/formFolders";
import { plural } from "../core/forms";
import { isValidName } from "../core/naming";
import type { FormDefinition } from "../core/types";
import type ModalFormsLitePlugin from "../main";
import { ConfirmModal } from "./ConfirmModal";
import { FormEditorModal } from "./FormEditorModal";
import { FormMetaModal } from "./FormMetaModal";

/**
 * Перечень форм с раскладкой по папкам. Слева папки, справа карточки форм
 * выбранной папки: когда форм становится много, плоский список перестаёт
 * читаться, а папка — это просто ярлык, никакой иерархии.
 */
export class FormListModal extends Modal {
    /** null — показаны все формы. */
    private selected: string | null = null;
    private foldersEl: HTMLElement | null = null;
    private cardsEl: HTMLElement | null = null;

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

        const browser = contentEl.createDiv({ cls: "mfl-browser" });
        this.foldersEl = browser.createDiv({ cls: "mfl-folders" });
        this.cardsEl = browser.createDiv({ cls: "mfl-cards" });

        this.render();
    }

    private get forms(): FormDefinition[] {
        return this.plugin.settings.forms;
    }

    private render(): void {
        // Папка могла исчезнуть вместе с последней своей формой.
        if (!folderExists(this.forms, this.selected)) this.selected = null;
        this.renderFolders();
        this.renderCards();
    }

    private renderFolders(): void {
        const container = this.foldersEl;
        if (!container) return;
        container.empty();

        this.renderFolderItem(container, null, "Все формы", "layers", this.forms.length);

        for (const entry of groupByFolder(this.forms)) {
            this.renderFolderItem(
                container,
                entry.name,
                entry.name === "" ? "Без папки" : entry.name,
                entry.name === "" ? "circle-dashed" : "folder",
                entry.count,
            );
        }
    }

    private renderFolderItem(
        container: HTMLElement,
        value: string | null,
        label: string,
        icon: string,
        count: number,
    ): void {
        const item = container.createDiv({ cls: "mfl-folder" });
        if (this.selected === value) item.addClass("is-active");

        const iconBox = item.createDiv({ cls: "mfl-folder-icon" });
        setIcon(iconBox, icon);
        item.createDiv({ cls: "mfl-folder-name", text: label });
        item.createDiv({ cls: "mfl-folder-count", text: String(count) });

        item.addEventListener("click", () => {
            this.selected = value;
            this.render();
        });
    }

    private renderCards(): void {
        const container = this.cardsEl;
        if (!container) return;
        container.empty();

        const forms = formsInFolder(this.forms, this.selected);
        if (forms.length === 0) {
            container.createDiv({ cls: "mfl-cards-empty", text: "В этой папке пока пусто" });
            return;
        }

        for (const form of forms) this.renderCard(container, form);
    }

    private renderCard(container: HTMLElement, form: FormDefinition): void {
        const card = container.createDiv({ cls: "mfl-card" });

        const head = card.createDiv({ cls: "mfl-card-head" });
        const iconBox = head.createDiv({ cls: "mfl-card-icon" });
        setIcon(iconBox, form.icon?.trim() || DEFAULT_FORM_ICON);

        const text = head.createDiv({ cls: "mfl-card-text" });
        text.createDiv({ cls: "mfl-card-title", text: form.title });
        text.createDiv({
            cls: "mfl-card-meta",
            text: `${form.name} · ${plural(form.fields.length, "поле", "поля", "полей")}`,
        });

        if (!isValidName(form.name)) {
            text.createDiv({
                cls: "mfl-warning",
                text: "Идентификатор содержит недопустимые символы — переименуйте форму",
            });
        }

        const marks = head.createDiv({ cls: "mfl-card-marks" });
        if (form.template) this.mark(marks, "file-text", "Есть шаблон заметки");
        if (form.command?.enabled) this.mark(marks, "terminal", "Есть команда в палитре");

        const actions = card.createDiv({ cls: "mfl-card-actions" });
        this.action(actions, "pencil", "Свойства формы", () => this.editMeta(form));
        this.action(actions, "settings", "Настройка полей", () => this.editFields(form));
        this.action(actions, "copy", "Дублировать", async () => {
            await this.plugin.duplicateForm(form.name);
            this.render();
        });
        this.action(actions, "clipboard-copy", "Экспорт в буфер", () => void this.exportForm(form));
        this.action(actions, "trash-2", "Удалить", () => this.deleteForm(form));
    }

    private mark(container: HTMLElement, icon: string, tooltip: string): void {
        const box = container.createDiv({ cls: "mfl-card-mark", attr: { "aria-label": tooltip } });
        setIcon(box, icon);
    }

    private action(
        container: HTMLElement,
        icon: string,
        tooltip: string,
        onClick: () => void,
    ): void {
        const button = container.createDiv({
            cls: "clickable-icon",
            attr: { "aria-label": tooltip },
        });
        setIcon(button, icon);
        button.addEventListener("click", onClick);
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
            folders: folderNames(this.forms),
            isNameTaken: (name) => this.plugin.isNameTaken(name, form.name),
            onSubmit: async ({ name, title, folder, icon, command, template }) => {
                await this.plugin.upsertForm(
                    { ...form, name, title, folder, icon, command, template },
                    form.name,
                );
                // Форма могла переехать в другую папку — покажем её там.
                this.selected = folder ?? "";
                this.render();
            },
        }).open();
    }

    private editFields(form: FormDefinition): void {
        new FormEditorModal(this.app, {
            form,
            context: this.plugin.editorContext(),
            onSave: async (edited, originalName) => {
                await this.plugin.upsertForm(edited, originalName);
                this.render();
            },
        }).open();
    }

    private deleteForm(form: FormDefinition): void {
        new ConfirmModal(this.app, {
            title: "Удалить форму?",
            message: `Форма «${form.title}» будет удалена без возможности восстановления.`,
            icon: "trash-2",
            danger: true,
            onConfirm: async () => {
                await this.plugin.removeForm(form.name);
                this.render();
            },
        }).open();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
