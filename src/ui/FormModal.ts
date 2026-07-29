import { App, Modal, Setting } from "obsidian";
import { IMAGE_ACCEPT, isAllowedImage, saveAttachment, toWikiLink } from "../core/attachments";
import { FormResult } from "../core/FormResult";
import type { FieldValue, FormData } from "../core/FormResult";
import { noteOptions, vaultTags } from "../core/vault";
import type { FieldDefinition, FormDefinition, SelectOption } from "../core/types";
import { FolderSuggest } from "./FolderSuggest";
import { MultiValueField } from "./MultiValueField";
import { NoteSuggest } from "./NoteSuggest";

export interface AttachmentFolders {
    imageFolder: string;
    fileFolder: string;
}

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
        private folders: AttachmentFolders,
        private resolve: (result: FormResult) => void,
        initial: Partial<FormData> = {},
    ) {
        super(app);

        for (const field of form.fields) {
            const provided = initial[field.name];
            if (provided !== undefined) {
                this.values[field.name] = provided;
                continue;
            }
            // У этих полей «пусто» не бывает: виджет всегда что-то показывает,
            // и результат должен совпадать с тем, что видит пользователь.
            if (field.input.type === "toggle") this.values[field.name] = false;
            if (field.input.type === "slider") this.values[field.name] = field.input.min;
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

        const preset = this.values[field.name];
        const input = field.input;

        switch (input.type) {
            case "text":
            case "textarea":
                this.renderTextLike(setting, field, input.type === "textarea", preset);
                break;

            case "number":
                setting.addText((text) => {
                    text.inputEl.type = "number";
                    if (preset !== undefined) text.setValue(String(preset));
                    text.onChange((value) => {
                        // Пустая строка — это «не заполнено», а не ноль.
                        this.setValue(field.name, value === "" ? "" : Number(value));
                    });
                });
                break;

            case "slider":
                setting.addSlider((slider) => {
                    slider
                        .setLimits(input.min, input.max, input.step)
                        .setValue(typeof preset === "number" ? preset : input.min)
                        .setDynamicTooltip()
                        .onChange((value) => this.setValue(field.name, value));
                });
                break;

            case "toggle":
                setting.addToggle((toggle) =>
                    toggle
                        .setValue(preset === true)
                        .onChange((value) => this.setValue(field.name, value)),
                );
                break;

            case "date":
            case "time":
            case "datetime":
                setting.addText((text) => {
                    text.inputEl.type =
                        input.type === "datetime" ? "datetime-local" : input.type;
                    if (preset !== undefined) text.setValue(String(preset));
                    text.onChange((value) => this.setValue(field.name, value));
                });
                break;

            case "select": {
                const options =
                    input.source === "fixed"
                        ? input.options
                        : noteOptions(this.app, input.folder);
                setting.addDropdown((dropdown) => {
                    dropdown.addOption("", "—");
                    for (const option of options) {
                        dropdown.addOption(option.value, option.label);
                    }
                    dropdown.setValue(preset === undefined ? "" : String(preset));
                    dropdown.onChange((value) => this.setValue(field.name, value));
                });
                break;
            }

            case "multiselect": {
                const candidates =
                    input.source === "fixed"
                        ? input.options
                        : noteOptions(this.app, input.folder);
                this.renderMultiValue(setting, field, candidates, false, preset);
                break;
            }

            case "tag":
                // Список тегов считаем один раз: обход хранилища на каждое
                // нажатие клавиши был бы заметно медленным.
                this.renderMultiValue(setting, field, vaultTags(this.app), true, preset);
                break;

            case "note":
                setting.addText((text) => {
                    if (preset !== undefined) text.setValue(String(preset));
                    text.onChange((value) => this.setValue(field.name, value));
                    new NoteSuggest(this.app, text.inputEl, input.folder, (basename) =>
                        this.setValue(field.name, basename),
                    );
                });
                break;

            case "folder":
                setting.addText((text) => {
                    if (preset !== undefined) text.setValue(String(preset));
                    text.onChange((value) => this.setValue(field.name, value));
                    new FolderSuggest(this.app, text.inputEl, (path) =>
                        this.setValue(field.name, path),
                    );
                });
                break;

            case "image":
            case "file":
                this.renderUpload(setting, field, input.type === "image", preset);
                break;
        }
    }

    private renderTextLike(
        setting: Setting,
        field: FieldDefinition,
        multiline: boolean,
        preset: FieldValue | undefined,
    ): void {
        if (multiline) {
            setting.setClass("mfl-textarea");
            setting.addTextArea((area) => {
                if (preset !== undefined) area.setValue(String(preset));
                area.onChange((value) => this.setValue(field.name, value));
            });
            return;
        }
        setting.addText((text) => {
            if (preset !== undefined) text.setValue(String(preset));
            text.onChange((value) => this.setValue(field.name, value));
        });
    }

    private renderMultiValue(
        setting: Setting,
        field: FieldDefinition,
        candidates: SelectOption[],
        allowNew: boolean,
        preset: FieldValue | undefined,
    ): void {
        setting.setClass("mfl-multi-row");
        new MultiValueField({
            app: this.app,
            container: setting.controlEl,
            initial: Array.isArray(preset) ? preset : [],
            candidates,
            allowNew,
            onChange: (values) => this.setValue(field.name, values),
        });
    }

    /**
     * Загрузка вложения. Файл попадает в хранилище сразу при выборе, а в
     * результат уходит ссылка на него — так к моменту отправки формы файл
     * уже лежит на месте и путь заведомо верный.
     */
    private renderUpload(
        setting: Setting,
        field: FieldDefinition,
        isImage: boolean,
        preset: FieldValue | undefined,
    ): void {
        setting.setClass("mfl-upload");

        const control = setting.controlEl;
        const picker = control.createEl("input", { type: "file" });
        if (isImage) picker.accept = IMAGE_ACCEPT;

        const info = control.createDiv({ cls: "mfl-upload-info" });
        if (preset !== undefined) info.setText(String(preset));

        picker.addEventListener("change", async () => {
            const file = picker.files?.[0];
            if (!file) return;

            if (isImage && !isAllowedImage(file.name)) {
                info.addClass("mfl-error");
                info.setText("Подходят только JPEG, PNG и WebP");
                picker.value = "";
                return;
            }

            info.removeClass("mfl-error");
            info.setText("Сохраняю…");

            try {
                const folder = isImage ? this.folders.imageFolder : this.folders.fileFolder;
                const path = await saveAttachment(this.app, file, folder);
                this.setValue(field.name, toWikiLink(path));
                info.setText(path);
            } catch (error) {
                console.error("[modal-forms-lite] не удалось сохранить вложение", error);
                info.addClass("mfl-error");
                info.setText("Не удалось сохранить файл");
                picker.value = "";
            }
        });
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
            if (value === undefined || this.isEmpty(value)) continue;
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
        if (value === undefined || value === "") return true;
        // Пустой список меток — тоже незаполненное поле.
        if (Array.isArray(value) && value.length === 0) return true;
        // false у переключателя — заполненное значение, а не пропуск.
        return false;
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
