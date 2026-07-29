import { App, Modal, Setting } from "obsidian";
import { FormResult } from "../core/FormResult";
import type { FieldValue, FormData } from "../core/FormResult";
import type { FieldDefinition, FormDefinition } from "../core/types";
import { FolderSuggest } from "./FolderSuggest";
import { NoteSuggest } from "./NoteSuggest";

/**
 * Заполнение формы. Собирает значения в плоский объект и отдаёт их через
 * `resolve`. Закрытие крестиком, Escape или кликом мимо считается отменой —
 * вызывающий код всегда получает ответ и никогда не зависает.
 */
export class FormModal extends Modal {
    private values: FormData = {};
    private errorEl: HTMLElement | null = null;
    private answered = false;

    constructor(
        app: App,
        private form: FormDefinition,
        private resolve: (result: FormResult) => void,
        initial: Partial<FormData> = {},
    ) {
        super(app);

        for (const field of form.fields) {
            const provided = initial[field.name];
            if (provided !== undefined) {
                this.values[field.name] = provided;
            } else if (field.input.type === "toggle") {
                // У переключателя «выключено» — полноценное значение, а не пустота.
                this.values[field.name] = false;
            }
        }
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass("mfl-modal");
        contentEl.createEl("h3", { text: this.form.title, cls: "mfl-title" });

        for (const field of this.form.fields) {
            this.renderField(contentEl, field);
        }

        this.errorEl = contentEl.createDiv({ cls: "mfl-error" });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText("Отмена").onClick(() => this.cancel()))
            .addButton((button) =>
                button
                    .setButtonText("Отправить")
                    .setCta()
                    .onClick(() => this.submit()),
            );

        contentEl.addEventListener("keydown", (event) => {
            // Enter в однострочном поле — привычная отправка, но в textarea он
            // нужен для переноса строки, поэтому там требуем модификатор.
            const inTextarea = event.target instanceof HTMLTextAreaElement;
            const withModifier = event.ctrlKey || event.metaKey;
            if (event.key === "Enter" && !event.isComposing && (withModifier || !inTextarea)) {
                event.preventDefault();
                this.submit();
            }
        });
    }

    private renderField(container: HTMLElement, field: FieldDefinition): void {
        const setting = new Setting(container).setName(field.label?.trim() || field.name);
        if (field.description) setting.setDesc(field.description);
        if (field.required) setting.nameEl.addClass("mfl-required");

        const input = field.input;
        switch (input.type) {
            case "text":
                setting.addText((text) =>
                    text.onChange((value) => this.setValue(field.name, value)),
                );
                break;

            case "textarea":
                setting.setClass("mfl-textarea");
                setting.addTextArea((area) =>
                    area.onChange((value) => this.setValue(field.name, value)),
                );
                break;

            case "number":
                setting.addText((text) => {
                    text.inputEl.type = "number";
                    text.onChange((value) => {
                        // Пустая строка — это «не заполнено», а не ноль.
                        this.setValue(field.name, value === "" ? "" : Number(value));
                    });
                });
                break;

            case "date":
                setting.addText((text) => {
                    text.inputEl.type = "date";
                    text.onChange((value) => this.setValue(field.name, value));
                });
                break;

            case "toggle":
                setting.addToggle((toggle) =>
                    toggle
                        .setValue(this.values[field.name] === true)
                        .onChange((value) => this.setValue(field.name, value)),
                );
                break;

            case "select":
                setting.addDropdown((dropdown) => {
                    dropdown.addOption("", "—");
                    for (const option of input.options) {
                        dropdown.addOption(option.value, option.label);
                    }
                    dropdown.onChange((value) => this.setValue(field.name, value));
                });
                break;

            case "note":
                setting.addText((text) => {
                    text.onChange((value) => this.setValue(field.name, value));
                    new NoteSuggest(this.app, text.inputEl, input.folder, (basename) =>
                        this.setValue(field.name, basename),
                    );
                });
                break;

            case "folder":
                setting.addText((text) => {
                    text.onChange((value) => this.setValue(field.name, value));
                    new FolderSuggest(this.app, text.inputEl, (path) =>
                        this.setValue(field.name, path),
                    );
                });
                break;
        }

        // Значения, переданные при вызове, показываем в уже отрисованных полях.
        const preset = this.values[field.name];
        if (preset !== undefined && input.type !== "toggle") {
            const control = setting.controlEl.querySelector("input, textarea, select");
            if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
                control.value = String(preset);
            } else if (control instanceof HTMLSelectElement) {
                control.value = String(preset);
            }
        }
    }

    private setValue(name: string, value: FieldValue): void {
        this.values[name] = value;
        if (this.errorEl) this.errorEl.setText("");
    }

    /** Пустые значения в результат не попадают — так чище frontmatter. */
    private collectData(): FormData {
        const data: FormData = {};
        for (const field of this.form.fields) {
            const value = this.values[field.name];
            if (value === undefined || value === "") continue;
            data[field.name] = value;
        }
        return data;
    }

    private submit(): void {
        const missing = this.form.fields.filter(
            (field) => field.required && this.isEmpty(this.values[field.name]),
        );
        if (missing.length > 0) {
            const names = missing.map((field) => field.label?.trim() || field.name).join(", ");
            if (this.errorEl) this.errorEl.setText(`Заполните обязательные поля: ${names}`);
            return;
        }

        this.answer(new FormResult(this.collectData(), "ok"));
    }

    private isEmpty(value: FieldValue | undefined): boolean {
        // false у переключателя — заполненное значение, а не пропуск.
        return value === undefined || value === "";
    }

    private cancel(): void {
        this.answer(new FormResult({}, "cancelled"));
    }

    private answer(result: FormResult): void {
        this.answered = true;
        this.resolve(result);
        this.close();
    }

    /** Крестик, Escape и клик мимо окна приходят сюда, минуя кнопки. */
    close(): void {
        if (!this.answered) {
            this.answered = true;
            this.resolve(new FormResult({}, "cancelled"));
        }
        super.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
