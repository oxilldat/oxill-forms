import { App, Modal, Setting, TextComponent } from "obsidian";
import { isValidName } from "../core/naming";
import type { FormDefinition } from "../core/types";
import { restrictToLatin } from "./restrictToLatin";

interface FormMeta {
    name: string;
    title: string;
}

interface FormMetaOptions {
    /** Если передана — режим правки, иначе создание. */
    form?: FormDefinition;
    isNameTaken: (name: string) => boolean;
    onSubmit: (meta: FormMeta) => void;
}

/**
 * Окно создания и переименования формы. Отвечает только за «шапку» формы —
 * идентификатор и заголовок; полями занимается отдельный редактор.
 */
export class FormMetaModal extends Modal {
    private name: string;
    private title: string;
    private errorEl: HTMLElement | null = null;
    private nameInput: TextComponent | null = null;

    constructor(
        app: App,
        private options: FormMetaOptions,
    ) {
        super(app);
        this.name = options.form?.name ?? "";
        this.title = options.form?.title ?? "";
    }

    private get isEditing(): boolean {
        return this.options.form !== undefined;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass("mfl-modal");
        contentEl.createEl("h3", {
            text: this.isEditing ? "Свойства формы" : "Новая форма",
            cls: "mfl-title",
        });

        new Setting(contentEl)
            .setName("Идентификатор")
            .setDesc("Уникальное имя, по которому форма вызывается из кода. Только латинские буквы")
            .addText((text) => {
                this.nameInput = text;
                text.setPlaceholder("A - z").setValue(this.name);
                restrictToLatin(text.inputEl, (value) => {
                    this.name = value;
                    this.clearError();
                });
            });

        new Setting(contentEl)
            .setName("Заголовок")
            .setDesc("Что видно в шапке открытой формы")
            .addText((text) =>
                text
                    .setPlaceholder("например, Новая книга")
                    .setValue(this.title)
                    .onChange((value) => {
                        this.title = value;
                        this.clearError();
                    }),
            );

        this.errorEl = contentEl.createDiv({ cls: "mfl-error" });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText(this.isEditing ? "Сохранить" : "Создать")
                    .setCta()
                    .onClick(() => this.submit()),
            );

        contentEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault();
                this.submit();
            }
        });

        // Курсор сразу в первом поле — иначе до него надо тянуться мышью.
        window.setTimeout(() => this.nameInput?.inputEl.focus(), 0);
    }

    private clearError(): void {
        if (this.errorEl) this.errorEl.setText("");
    }

    private fail(message: string): void {
        if (this.errorEl) this.errorEl.setText(message);
    }

    private submit(): void {
        const name = this.name.trim();
        const title = this.title.trim();

        if (name === "") return this.fail("Идентификатор не может быть пустым");
        if (!isValidName(name)) {
            return this.fail("Идентификатор — только латинские буквы, без цифр, пробелов и знаков");
        }
        if (this.options.isNameTaken(name)) return this.fail(`Форма «${name}» уже существует`);

        this.close();
        // Пустой заголовок — не ошибка: подставляем идентификатор.
        this.options.onSubmit({ name, title: title === "" ? name : title });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
