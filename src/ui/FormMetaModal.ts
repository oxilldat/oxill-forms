import { App, Modal, Setting, TextComponent } from "obsidian";
import { isValidName } from "../core/naming";
import {
    COMMAND_MODE_LABELS,
    OUTPUT_FORMAT_LABELS,
} from "../core/types";
import type {
    CommandMode,
    FieldDefinition,
    FormCommand,
    FormDefinition,
    OutputFormat,
} from "../core/types";
import { FolderSuggest } from "./FolderSuggest";
import { restrictToLatin } from "./restrictToLatin";

export interface FormMeta {
    name: string;
    title: string;
    command?: FormCommand;
}

interface FormMetaOptions {
    /** Если передана — режим правки, иначе создание. */
    form?: FormDefinition;
    isNameTaken: (name: string) => boolean;
    onSubmit: (meta: FormMeta) => void;
}

function defaultCommand(): FormCommand {
    return { enabled: false, mode: "insert", format: "dataview" };
}

/**
 * Свойства формы: идентификатор, заголовок и настройки команды в палитре.
 * Состав полей правится отдельным окном.
 */
export class FormMetaModal extends Modal {
    private name: string;
    private title: string;
    private command: FormCommand;
    private readonly fields: FieldDefinition[];
    private commandEl: HTMLElement | null = null;
    private errorEl: HTMLElement | null = null;
    private nameInput: TextComponent | null = null;

    constructor(
        app: App,
        private options: FormMetaOptions,
    ) {
        super(app);
        this.name = options.form?.name ?? "";
        this.title = options.form?.title ?? "";
        this.command = options.form?.command
            ? { ...options.form.command }
            : defaultCommand();
        this.fields = options.form?.fields ?? [];
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

        new Setting(contentEl).setName("Команда в палитре").setHeading();

        new Setting(contentEl)
            .setName("Добавить команду")
            .setDesc("В палитре появится «Заполнить: …»")
            .addToggle((toggle) =>
                toggle.setValue(this.command.enabled).onChange((value) => {
                    this.command.enabled = value;
                    this.clearError();
                    this.renderCommand();
                }),
            );

        this.commandEl = contentEl.createDiv();
        this.renderCommand();

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

    private renderCommand(): void {
        const container = this.commandEl;
        if (!container) return;
        container.empty();
        if (!this.command.enabled) return;

        new Setting(container).setName("Что делает").addDropdown((dropdown) => {
            for (const [mode, label] of Object.entries(COMMAND_MODE_LABELS)) {
                dropdown.addOption(mode, label);
            }
            dropdown.setValue(this.command.mode).onChange((value) => {
                this.command.mode = value as CommandMode;
                this.clearError();
                this.renderCommand();
            });
        });

        new Setting(container).setName("Формат результата").addDropdown((dropdown) => {
            for (const [format, label] of Object.entries(OUTPUT_FORMAT_LABELS)) {
                dropdown.addOption(format, label);
            }
            dropdown.setValue(this.command.format).onChange((value) => {
                this.command.format = value as OutputFormat;
            });
        });

        if (this.command.mode !== "create") return;

        new Setting(container)
            .setName("Папка для заметок")
            .setDesc("Пусто — корень хранилища")
            .addText((text) => {
                text.setPlaceholder("Корень хранилища")
                    .setValue(this.command.folder ?? "")
                    .onChange((value) => {
                        this.command.folder = value.trim();
                    });
                new FolderSuggest(this.app, text.inputEl, (path) => {
                    this.command.folder = path;
                });
            });

        const named = this.fields.filter((field) => !field.hidden);
        if (named.length === 0) {
            new Setting(container)
                .setName("Имя заметки")
                .setDesc("В форме ещё нет полей — имя возьмётся из заголовка формы");
            return;
        }

        new Setting(container)
            .setName("Имя заметки из поля")
            .setDesc("Если поле окажется пустым, возьмём заголовок формы")
            .addDropdown((dropdown) => {
                dropdown.addOption("", "— заголовок формы —");
                for (const field of named) {
                    dropdown.addOption(field.name, field.label?.trim() || field.name);
                }
                dropdown.setValue(this.command.nameField ?? "").onChange((value) => {
                    if (value === "") delete this.command.nameField;
                    else this.command.nameField = value;
                });
            });
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
        this.options.onSubmit({
            name,
            title: title === "" ? name : title,
            command: this.command,
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
