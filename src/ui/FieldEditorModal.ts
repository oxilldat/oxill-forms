import { App, Modal, Setting } from "obsidian";
import { defaultInputFor, validateField, withSource } from "../core/fields";
import { INPUT_TYPE_LABELS } from "../core/types";
import type { FieldDefinition, InputTypeName, SelectOption } from "../core/types";
import { FolderSuggest } from "./FolderSuggest";
import { restrictToLatin } from "./restrictToLatin";

interface FieldEditorOptions {
    field: FieldDefinition;
    /** Остальные поля формы — по ним проверяется уникальность идентификатора. */
    otherFields: FieldDefinition[];
    isNew?: boolean;
    onSubmit: (field: FieldDefinition) => void;
}

/**
 * Окно создания и правки одного поля. Работает с копией: пока не нажата
 * кнопка сохранения, форма-владелец о правках не знает.
 */
export class FieldEditorModal extends Modal {
    private draft: FieldDefinition;
    private optionsEl: HTMLElement | null = null;
    private errorEl: HTMLElement | null = null;

    constructor(
        app: App,
        private options: FieldEditorOptions,
    ) {
        super(app);
        this.draft = structuredClone(options.field);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass("mfl-modal");
        contentEl.createEl("h3", {
            text: this.options.isNew ? "Новое поле" : "Настройка поля",
            cls: "mfl-title",
        });

        new Setting(contentEl)
            .setName("Идентификатор")
            .setDesc("Ключ в результате формы. Только латинские буквы")
            .addText((text) => {
                text.setPlaceholder("A - z").setValue(this.draft.name);
                restrictToLatin(text.inputEl, (value) => {
                    this.draft.name = value;
                    this.clearError();
                });
            });

        new Setting(contentEl).setName("Подпись").addText((text) =>
            text
                .setPlaceholder("Что видит пользователь")
                .setValue(this.draft.label ?? "")
                .onChange((value) => {
                    this.draft.label = value;
                }),
        );

        new Setting(contentEl).setName("Описание").addText((text) =>
            text
                .setPlaceholder("Пояснение под подписью")
                .setValue(this.draft.description ?? "")
                .onChange((value) => {
                    this.draft.description = value;
                }),
        );

        new Setting(contentEl).setName("Обязательное").addToggle((toggle) =>
            toggle.setValue(this.draft.required === true).onChange((value) => {
                this.draft.required = value;
            }),
        );

        new Setting(contentEl).setName("Тип").addDropdown((dropdown) => {
            for (const [type, label] of Object.entries(INPUT_TYPE_LABELS)) {
                dropdown.addOption(type, label);
            }
            dropdown.setValue(this.draft.input.type).onChange((value) => {
                // Настройки старого типа несовместимы с новым — сбрасываем.
                this.draft.input = defaultInputFor(value as InputTypeName);
                this.renderInputOptions();
                this.clearError();
            });
        });

        this.optionsEl = contentEl.createDiv();
        this.renderInputOptions();

        this.errorEl = contentEl.createDiv({ cls: "mfl-error" });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText(this.options.isNew ? "Добавить" : "Сохранить")
                    .setCta()
                    .onClick(() => this.submit()),
            );
    }

    /** Настройки, специфичные для выбранного типа. */
    private renderInputOptions(): void {
        const container = this.optionsEl;
        if (!container) return;
        container.empty();

        const input = this.draft.input;

        if (input.type === "note") {
            this.renderFolderPicker(container, "Папка с заметками", input.folder, (path) => {
                input.folder = path;
            });
            return;
        }

        if (input.type === "slider") {
            this.renderNumber(container, "Минимум", input.min, (value) => {
                input.min = value;
            });
            this.renderNumber(container, "Максимум", input.max, (value) => {
                input.max = value;
            });
            this.renderNumber(container, "Шаг", input.step, (value) => {
                input.step = value;
            });
            return;
        }

        if (input.type === "image" || input.type === "file") {
            const folder = input.type === "image" ? "фотографий" : "файлов";
            new Setting(container)
                .setName("Куда сохраняется")
                .setDesc(`Папка задана в настройках плагина — «Место сохранения ${folder}»`);
            return;
        }

        if (input.type === "tag") {
            new Setting(container)
                .setName("Источник подсказок")
                .setDesc("Теги, уже встречающиеся в хранилище. Свои тоже можно вводить");
            return;
        }

        if (input.type === "select" || input.type === "multiselect") {
            const kind = input.type;
            new Setting(container).setName("Источник").addDropdown((dropdown) => {
                dropdown.addOption("fixed", "Заданный список");
                dropdown.addOption("notes", "Заметки из папки");
                dropdown.setValue(input.source).onChange((value) => {
                    this.draft.input = withSource(kind, value === "notes" ? "notes" : "fixed");
                    this.renderInputOptions();
                    this.clearError();
                });
            });

            if (input.source === "notes") {
                this.renderFolderPicker(container, "Папка с заметками", input.folder, (path) => {
                    input.folder = path;
                });
                return;
            }

            const list = container.createDiv({ cls: "mfl-options" });
            input.options.forEach((option, index) => {
                this.renderSelectOption(list, input.options, option, index);
            });

            new Setting(container).addButton((button) =>
                button.setButtonText("Добавить вариант").onClick(() => {
                    input.options.push({ value: "", label: "" });
                    this.renderInputOptions();
                }),
            );
        }
    }

    private renderFolderPicker(
        container: HTMLElement,
        name: string,
        value: string,
        onChange: (path: string) => void,
    ): void {
        new Setting(container)
            .setName(name)
            .setDesc("Начните вводить или выберите из списка")
            .addText((text) => {
                text.setPlaceholder("Книги")
                    .setValue(value)
                    .onChange((entered) => {
                        onChange(entered);
                        this.clearError();
                    });
                new FolderSuggest(this.app, text.inputEl, (path) => {
                    onChange(path);
                    this.clearError();
                });
            });
    }

    private renderNumber(
        container: HTMLElement,
        name: string,
        value: number,
        onChange: (value: number) => void,
    ): void {
        new Setting(container).setName(name).addText((text) => {
            text.inputEl.type = "number";
            text.setValue(String(value)).onChange((entered) => {
                const parsed = Number(entered);
                if (Number.isFinite(parsed)) onChange(parsed);
                this.clearError();
            });
        });
    }

    private renderSelectOption(
        list: HTMLElement,
        options: SelectOption[],
        option: SelectOption,
        index: number,
    ): void {
        const row = new Setting(list).setClass("mfl-option-row");
        row.addText((text) =>
            text
                .setPlaceholder("значение")
                .setValue(option.value)
                .onChange((value) => {
                    option.value = value;
                    this.clearError();
                }),
        );
        row.addText((text) =>
            text
                .setPlaceholder("подпись")
                .setValue(option.label)
                .onChange((value) => {
                    option.label = value;
                }),
        );
        row.addExtraButton((button) =>
            button
                .setIcon("trash-2")
                .setTooltip("Убрать вариант")
                .onClick(() => {
                    options.splice(index, 1);
                    this.renderInputOptions();
                }),
        );
    }

    private clearError(): void {
        if (this.errorEl) this.errorEl.setText("");
    }

    private submit(): void {
        this.draft.name = this.draft.name.trim();

        const input = this.draft.input;
        if ((input.type === "select" || input.type === "multiselect") && input.source === "fixed") {
            for (const option of input.options) {
                option.value = option.value.trim();
                // Пустая подпись — не ошибка: показываем само значение.
                if (option.label.trim() === "") option.label = option.value;
            }
        }

        const error = validateField(this.draft, this.options.otherFields);
        if (error) {
            if (this.errorEl) this.errorEl.setText(error);
            return;
        }

        this.close();
        this.options.onSubmit(this.draft);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
