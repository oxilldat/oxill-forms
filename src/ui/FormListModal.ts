import { App, Modal, Notice, setIcon } from "obsidian";
import { bundleToJson } from "../core/exchange";
import {
    DEFAULT_FORM_ICON,
    folderExists,
    folderNames,
    formsInFolder,
    groupByFolder,
    showsAllForms,
} from "../core/formFolders";
import { t, tp } from "../i18n";
import { isValidName } from "../core/naming";
import type { FormDefinition } from "../core/types";
import type FormsPlugin from "../main";
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
    /** Открыта строка ввода названия новой папки. */
    private creating = false;
    private folderInput: HTMLInputElement | null = null;
    /**
     * Форма, которую сейчас тащат. dataTransfer тоже заполняем, но читать
     * его во время `dragover` браузер не даёт, а подсветить цель нужно
     * именно тогда.
     */
    private dragging: string | null = null;

    constructor(
        app: App,
        private plugin: FormsPlugin,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        modalEl.addClass("oxf-wide-modal");
        contentEl.addClass("oxf-modal");

        // Заголовка у окна нет намеренно: колонка папок и карточки форм и так
        // говорят, куда попал, а строка «Формы» только отъедала высоту.
        const browser = contentEl.createDiv({ cls: "oxf-browser" });
        this.foldersEl = browser.createDiv({ cls: "oxf-folders" });
        this.cardsEl = browser.createDiv({ cls: "oxf-cards" });

        this.render();
    }

    private get forms(): FormDefinition[] {
        return this.plugin.settings.forms;
    }

    private get folders(): string[] {
        return this.plugin.settings.folders;
    }

    /** Скрыта ли строка «Все формы» — правило целиком в ядре. */
    private get allFormsHidden(): boolean {
        return !showsAllForms(this.forms, this.folders, this.plugin.settings.hideAllFormsFolder);
    }

    private render(): void {
        // Папка могла исчезнуть вместе с последней своей формой.
        if (!folderExists(this.forms, this.selected, this.folders)) this.selected = null;

        // Без строки «Все формы» выбор не может быть пустым: открываем первую
        // папку, иначе окно показывало бы список без отмеченной строки слева.
        if (this.selected === null && this.allFormsHidden) {
            this.selected = groupByFolder(this.forms, this.folders)[0]?.name ?? null;
        }

        this.renderFolders();
        this.renderCards();
    }

    private renderFolders(): void {
        const container = this.foldersEl;
        if (!container) return;
        container.empty();

        const head = container.createDiv({ cls: "oxf-folders-head" });
        head.createDiv({ cls: "oxf-folders-title", text: t("browser.folders") });
        const add = head.createDiv({
            cls: "clickable-icon",
            attr: { "aria-label": t("browser.newFolder") },
        });
        setIcon(add, "folder-plus");
        add.addEventListener("click", () => {
            // Повторное нажатие не должно пересоздавать строку ввода: набранное
            // название пропало бы, а старое поле ушло бы из разметки с фокусом.
            if (this.creating) {
                this.folderInput?.focus();
                return;
            }
            this.creating = true;
            this.renderFolders();
        });

        const list = container.createDiv({ cls: "oxf-folders-list" });
        if (!this.allFormsHidden) {
            this.renderFolderItem(list, null, t("browser.allForms"), "layers", this.forms.length);
        }

        for (const entry of groupByFolder(this.forms, this.folders)) {
            this.renderFolderItem(
                list,
                entry.name,
                entry.name === "" ? t("browser.noFolder") : entry.name,
                entry.name === "" ? "circle-dashed" : "folder",
                entry.count,
            );
        }

        if (this.creating) this.renderNewFolder(list);
    }

    private renderFolderItem(
        container: HTMLElement,
        value: string | null,
        label: string,
        icon: string,
        count: number,
    ): void {
        const item = container.createDiv({ cls: "oxf-folder" });
        if (this.selected === value) item.addClass("is-active");

        const iconBox = item.createDiv({ cls: "oxf-folder-icon" });
        setIcon(iconBox, icon);
        item.createDiv({ cls: "oxf-folder-name", text: label });
        item.createDiv({ cls: "oxf-folder-count", text: String(count) });

        // Крестик у каждой папки. «Все формы» и «Без папки» не папки, а
        // способ смотреть на список — убирать там нечего.
        if (value !== null && value !== "") {
            // По классу стили понимают, что счётчик этой строки на ховере
            // уступает место крестику.
            item.addClass("is-forgettable");
            const empty = count === 0;
            const forget = item.createDiv({
                cls: "clickable-icon oxf-folder-forget",
                attr: { "aria-label": empty ? t("browser.forgetFolder") : t("browser.deleteFolder") },
            });
            setIcon(forget, "x");
            forget.addEventListener("click", (event) => {
                // Иначе клик заодно выберет папку, которой сейчас не станет.
                event.stopPropagation();
                // У пустой папки терять нечего, спрашивать не о чем.
                if (empty) void this.forgetFolder(value);
                else this.confirmDeleteFolder(value, count);
            });
        }

        item.addEventListener("click", () => {
            this.selected = value;
            this.render();
        });

        // «Все формы» — не папка, и класть в неё нечего.
        if (value !== null) this.acceptDrop(item, value);
    }

    private async forgetFolder(name: string): Promise<void> {
        await this.plugin.forgetFolder(name);
        if (this.selected === name) this.selected = null;
        this.render();
    }

    /**
     * Удаление непустой папки. Спрашиваем не потому, что что-то пропадёт, а
     * потому, что разложить формы обратно — это по перетаскиванию на каждую.
     */
    private confirmDeleteFolder(name: string, count: number): void {
        new ConfirmModal(this.app, {
            title: t("browser.deleteFolderTitle", { name }),
            // Единственная форма — отдельной фразой: во всех языках счёт
            // одного предмета звучит иначе, чем счёт нескольких.
            message:
                count === 1
                    ? t("browser.deleteFolderOne")
                    : t("browser.deleteFolderMany", { count }),
            icon: "folder-x",
            danger: true,
            confirmText: t("confirm.deleteFolder"),
            onConfirm: async () => {
                await this.plugin.deleteFolder(name);
                if (this.selected === name) this.selected = null;
                this.render();
            },
        }).open();
    }

    /** Строка ввода вместо окна: папка нужна на один раз и сразу. */
    private renderNewFolder(container: HTMLElement): void {
        const row = container.createDiv({ cls: "oxf-folder oxf-folder-new" });
        const iconBox = row.createDiv({ cls: "oxf-folder-icon" });
        setIcon(iconBox, "folder-plus");

        const input = row.createEl("input", {
            cls: "oxf-folder-input",
            attr: { type: "text", placeholder: t("browser.folderName") },
        });
        this.folderInput = input;

        // Ввод закрывается один раз: Enter уводит фокус, и без флага сразу
        // за ним пришёл бы blur со второй попыткой создать ту же папку.
        let done = false;
        const finish = async (save: boolean): Promise<void> => {
            if (done) return;
            done = true;
            this.creating = false;
            this.folderInput = null;

            const name = input.value.trim();
            if (save && name !== "") {
                if (folderNames(this.forms, this.folders).includes(name)) {
                    new Notice(t("browser.folderExists", { name }));
                } else {
                    await this.plugin.createFolder(name);
                }
                this.selected = name;
            }
            this.render();
        };

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                void finish(true);
                return;
            }
            if (event.key === "Escape") {
                // Иначе Escape закроет заодно и всё окно списка форм.
                event.preventDefault();
                event.stopPropagation();
                void finish(false);
            }
        });
        input.addEventListener("blur", () => void finish(true));

        window.setTimeout(() => input.focus(), 0);
    }

    private renderCards(): void {
        const container = this.cardsEl;
        if (!container) return;
        container.empty();
        container.toggleClass("is-droppable", this.selected !== null);

        // Открытая папка — тоже цель: бросить форму в её пустоту так же
        // естественно, как в строку слева.
        if (this.selected !== null) this.acceptDrop(container, this.selected);

        const forms = formsInFolder(this.forms, this.selected);
        if (forms.length === 0) {
            container.createDiv({
                cls: "oxf-cards-empty",
                text:
                    this.selected === null
                        ? t("browser.empty")
                        : t("browser.emptyFolder"),
            });
            return;
        }

        for (const form of forms) this.renderCard(container, form);
    }

    /**
     * Делает элемент целью перетаскивания. Перекладываем на месте: подтверждать
     * тут нечего, а вернуть форму назад — это ещё одно движение мышью.
     */
    private acceptDrop(target: HTMLElement, folder: string): void {
        target.addEventListener("dragover", (event) => {
            if (this.dragging === null) return;
            // Без preventDefault браузер считает, что бросать сюда нельзя.
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            target.addClass("is-drop-target");
        });

        target.addEventListener("dragleave", (event) => {
            // Переход на вложенный значок или подпись — это тоже dragleave
            // самой строки. Снимаем подсветку, только если ушли наружу.
            const to = event.relatedTarget;
            if (to instanceof Node && target.contains(to)) return;
            target.removeClass("is-drop-target");
        });

        target.addEventListener("drop", async (event) => {
            event.preventDefault();
            target.removeClass("is-drop-target");

            const name = this.dragging ?? event.dataTransfer?.getData("text/plain") ?? "";
            this.dragging = null;
            if (name === "") return;

            const form = this.forms.find((candidate) => candidate.name === name);
            if (!form || (form.folder?.trim() ?? "") === folder) return;

            await this.plugin.moveFormToFolder(name, folder);
            new Notice(
                folder === ""
                    ? t("browser.movedOut", { title: form.title })
                    : t("browser.moved", { title: form.title, folder }),
            );
            this.render();
        });
    }

    private renderCard(container: HTMLElement, form: FormDefinition): void {
        const card = container.createDiv({ cls: "oxf-card", attr: { draggable: "true" } });

        card.addEventListener("dragstart", (event) => {
            this.dragging = form.name;
            card.addClass("is-dragging");
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", form.name);
            }
        });

        card.addEventListener("dragend", () => {
            this.dragging = null;
            card.removeClass("is-dragging");
        });

        const head = card.createDiv({ cls: "oxf-card-head" });
        const iconBox = head.createDiv({ cls: "oxf-card-icon" });
        setIcon(iconBox, form.icon?.trim() || DEFAULT_FORM_ICON);

        const text = head.createDiv({ cls: "oxf-card-text" });
        text.createDiv({ cls: "oxf-card-title", text: form.title });
        text.createDiv({
            cls: "oxf-card-meta",
            text: `${form.name} · ${tp("browser.fields", form.fields.length)}`,
        });

        if (!isValidName(form.name)) {
            text.createDiv({
                cls: "oxf-warning",
                text: t("browser.badName"),
            });
        }

        const marks = head.createDiv({ cls: "oxf-card-marks" });
        if (form.template) this.mark(marks, "file-text", t("browser.hasTemplate"));
        if (form.command?.enabled) this.mark(marks, "terminal", t("browser.hasCommand"));

        const actions = card.createDiv({ cls: "oxf-card-actions" });
        this.action(actions, "pencil", t("browser.editMeta"), () => this.editMeta(form));
        this.action(actions, "settings", t("browser.editFields"), () => this.editFields(form));
        this.action(actions, "copy", t("browser.duplicate"), async () => {
            await this.plugin.duplicateForm(form.name);
            this.render();
        });
        this.action(actions, "clipboard-copy", t("browser.export"), () => void this.exportForm(form));
        this.action(actions, "trash-2", t("common.delete"), () => this.deleteForm(form));
    }

    private mark(container: HTMLElement, icon: string, tooltip: string): void {
        const box = container.createDiv({ cls: "oxf-card-mark", attr: { "aria-label": tooltip } });
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
            new Notice(t("browser.exported", { title: form.title }));
        } catch (error) {
            console.error("[oxill-forms] не удалось скопировать форму", error);
            new Notice(t("browser.clipboardFailed"));
        }
    }

    private editMeta(form: FormDefinition): void {
        new FormMetaModal(this.app, {
            form,
            folders: folderNames(this.forms, this.folders),
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
            title: t("browser.deleteFormTitle"),
            message: t("browser.deleteFormText", { title: form.title }),
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
