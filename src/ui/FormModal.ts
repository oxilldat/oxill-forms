import { App, Modal, Setting } from "obsidian";
import { IMAGE_ACCEPT, isAllowedImage, saveAttachment, toWikiLink } from "../core/attachments";
import { acceptAttribute, formatExtensions, isAllowedExtension } from "../core/extensions";
import { conditionMet } from "../core/conditions";
import { t } from "../i18n";
import { DataviewError, runDataviewQuery } from "../core/dataview";
import { renderTemplate } from "../core/format";
import { excludeMatching } from "../core/patterns";
import { checkValue } from "../core/rules";
import { sectionOwners } from "../core/sections";
import { ConfirmModal } from "./ConfirmModal";
import { FormResult } from "../core/FormResult";
import type { FieldValue, FormData } from "../core/FormResult";
import { noteOptions, noteOptionsIn, vaultTags } from "../core/vault";
import { isDecorative } from "../core/types";
import type { FieldDefinition, FormDefinition, SelectOption } from "../core/types";
import { DataviewSuggest } from "./DataviewSuggest";
import { FolderSuggest } from "./FolderSuggest";
import { MultiValueField } from "./MultiValueField";
import type { MultiValueSource } from "./MultiValueField";
import { NoteSuggest } from "./NoteSuggest";

export interface FormRuntime {
    imageFolder: string;
    fileFolder: string;
    /**
     * Пока выключено, поля Dataview показываются обычным вводом и никакой
     * пользовательский код не исполняется.
     */
    dataviewEnabled: boolean;
    /** Спрашивать перед закрытием формы, в которой уже что-то заполнено. */
    confirmDiscard: boolean;
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
    /** Слепок значений на старте — по нему видно, начал ли пользователь заполнять. */
    private snapshot = "";
    /**
     * Все отрисованные строки: скрыть может не только своё условие, но и
     * условие раздела, поэтому пересчитывать приходится каждую.
     */
    private conditionalRows: { field: FieldDefinition; el: HTMLElement }[] = [];
    /** Поле → раздел, в котором оно лежит. */
    private sections = new Map<string, FieldDefinition>();
    /** Обёртка и место под ошибку для каждого поля — ошибка живёт рядом со своим полем. */
    private rows = new Map<string, { wrap: HTMLElement; errorEl: HTMLElement }>();
    /** Вложения, записанные за этот сеанс. При отмене отправляются в корзину. */
    private createdAttachments: string[] = [];

    constructor(
        app: App,
        private form: FormDefinition,
        private runtime: FormRuntime,
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

        this.sections = sectionOwners(form.fields);

        // Снимаем после заполнения начальных значений: предзаполненное и
        // значения переключателей — не ввод пользователя.
        this.snapshot = JSON.stringify(this.values);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass("mfl-modal");
        contentEl.createEl("h3", { text: this.form.title, cls: "mfl-title" });

        for (const field of this.form.fields) {
            // Скрытое поле не рисуем вовсе, но значение из values сохраняем —
            // оно уйдёт в результат, для этого такие поля и нужны.
            if (field.hidden) continue;
            this.renderField(contentEl, field);
        }
        this.refreshVisibility();

        this.errorEl = contentEl.createDiv({ cls: "mfl-error" });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText(t("common.cancel")).onClick(() => this.cancel()))
            .addButton((button) =>
                button
                    .setButtonText(t("common.submit"))
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
                return;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                if (!this.arrowsCanNavigate(event.target)) return;
                event.preventDefault();
                this.moveFocus(event.key === "ArrowDown" ? 1 : -1);
            }
        });

        // Курсор сразу в первом поле — иначе до него надо тянуться мышью.
        window.setTimeout(() => this.focusables()[0]?.focus(), 0);
    }

    /** Поля формы в том порядке, в каком они видны на экране. */
    private focusables(): HTMLElement[] {
        return Array.from(
            this.contentEl.querySelectorAll<HTMLElement>("input, textarea, select"),
        ).filter((el) => el.offsetParent !== null && !el.hasAttribute("disabled"));
    }

    private moveFocus(delta: number): void {
        const items = this.focusables();
        const current = items.indexOf(document.activeElement as HTMLElement);
        if (current === -1) {
            items[0]?.focus();
            return;
        }
        items[current + delta]?.focus();
    }

    /**
     * Стрелки перебрасывают между полями только там, где у них нет своей
     * работы. В многострочном тексте они двигают курсор, в списке меняют
     * значение, в числе и ползунке прибавляют и убавляют — туда не лезем.
     */
    private arrowsCanNavigate(target: EventTarget | null): boolean {
        // Открытая подсказка сама обрабатывает стрелки для выбора варианта.
        if (document.querySelector(".suggestion-container") !== null) return false;

        if (target instanceof HTMLTextAreaElement) return false;
        if (target instanceof HTMLSelectElement) return false;
        if (target instanceof HTMLInputElement) {
            return target.type !== "range" && target.type !== "number";
        }
        return true;
    }

    private renderField(container: HTMLElement, field: FieldDefinition): void {
        // Каждое поле живёт в своей обёртке: под ней место для ошибки, а
        // условие показа прячет обёртку целиком вместе с этой ошибкой.
        const wrap = container.createDiv({ cls: "mfl-field-wrap" });

        if (field.input.type === "section") {
            wrap.addClass("mfl-section");
            const heading = new Setting(wrap)
                .setName(field.label?.trim() || field.name)
                .setHeading();
            if (field.description) heading.setDesc(field.description);
            this.conditionalRows.push({ field, el: wrap });
            return;
        }

        const setting = new Setting(wrap).setName(field.label?.trim() || field.name);
        if (field.description) setting.setDesc(field.description);
        if (field.required) setting.nameEl.addClass("mfl-required");
        this.conditionalRows.push({ field, el: wrap });

        const errorEl = wrap.createDiv({ cls: "mfl-field-error" });
        this.rows.set(field.name, { wrap, errorEl });

        const preset = this.values[field.name];
        const input = field.input;
        const hint = field.placeholder?.trim() ?? "";

        switch (input.type) {
            case "text":
            case "textarea":
                this.renderTextLike(setting, field, input.type === "textarea", preset, hint);
                break;

            case "email":
            case "tel":
                setting.addText((text) => {
                    text.inputEl.type = input.type;
                    if (hint !== "") text.setPlaceholder(hint);
                    if (preset !== undefined) text.setValue(String(preset));
                    text.onChange((value) => this.setValue(field.name, value));
                });
                break;

            case "number":
                setting.addText((text) => {
                    text.inputEl.type = "number";
                    if (hint !== "") text.setPlaceholder(hint);
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
                    // Пустой пункт нужен только там, где ответ можно не давать.
                    // У обязательного поля он был бы ловушкой.
                    if (!field.required) dropdown.addOption("", "—");
                    for (const option of options) {
                        dropdown.addOption(option.value, option.label);
                    }
                    const initial =
                        preset === undefined
                            ? field.required
                                ? (options[0]?.value ?? "")
                                : ""
                            : String(preset);
                    dropdown.setValue(initial);
                    this.setValue(field.name, initial);
                    dropdown.onChange((value) => this.setValue(field.name, value));
                });
                break;
            }

            case "multiselect": {
                if (input.source === "dataview") {
                    // Значения из запроса набираются только выбором. Когда
                    // Dataview выключен, список взять неоткуда — оставляем
                    // свободный ввод, иначе поле стало бы нерабочим.
                    const enabled = this.runtime.dataviewEnabled;
                    this.renderMultiValue(
                        setting,
                        field,
                        enabled ? this.dataviewOptions(field.name, input.query) : [],
                        !enabled,
                        preset,
                    );
                    break;
                }

                const candidates =
                    input.source === "fixed"
                        ? input.options
                        : noteOptionsIn(this.app, [input.folder, ...(input.folders ?? [])]);
                this.renderMultiValue(setting, field, candidates, false, preset);
                break;
            }

            case "tag":
                // Список тегов считаем один раз: обход хранилища на каждое
                // нажатие клавиши был бы заметно медленным.
                this.renderMultiValue(
                    setting,
                    field,
                    excludeMatching(vaultTags(this.app), input.exclude),
                    true,
                    preset,
                );
                break;

            case "dataview":
                setting.addText((text) => {
                    if (preset !== undefined) text.setValue(String(preset));
                    text.onChange((value) => this.setValue(field.name, value));

                    if (!this.runtime.dataviewEnabled) {
                        text.setPlaceholder(t("fill.dataviewOff"));
                        return;
                    }

                    new DataviewSuggest(this.app, text.inputEl, {
                        query: input.query,
                        fieldName: field.name,
                        getForm: () => this.values,
                        onChoose: (value) => this.setValue(field.name, value),
                        onError: (message) => {
                            if (this.errorEl) this.errorEl.setText(message);
                        },
                    });
                });
                break;

            case "note": {
                const available = noteOptions(this.app, input.folder);
                setting.addText((text) => {
                    text.setPlaceholder(
                        available.length === 0
                            ? t("fill.noNotesInFolder", { folder: input.folder })
                            : hint !== ""
                              ? hint
                              : t("fill.typeNoteName"),
                    );
                    if (available.length === 0) text.setDisabled(true);
                    if (preset !== undefined) text.setValue(String(preset));
                    text.onChange((value) => this.setValue(field.name, value));
                    new NoteSuggest(this.app, text.inputEl, input.folder, (basename) =>
                        this.setValue(field.name, basename),
                    );
                });
                break;
            }

            case "folder":
                setting.addText((text) => {
                    if (hint !== "") text.setPlaceholder(hint);
                    // Без подсказки не видно, что список папок сужен.
                    else if (input.parent !== undefined) {
                        text.setPlaceholder(t("fill.folderInside", { folder: input.parent }));
                    }
                    if (preset !== undefined) text.setValue(String(preset));
                    text.onChange((value) => this.setValue(field.name, value));
                    new FolderSuggest(
                        this.app,
                        text.inputEl,
                        (path) => this.setValue(field.name, path),
                        input.parent,
                    );
                });
                break;

            case "image":
            case "file":
                this.renderUpload(setting, field, input.type === "image", preset);
                break;
        }
    }

    /** Показывает ошибку под конкретным полем и подсвечивает само поле. */
    private setFieldError(name: string, message: string): void {
        const row = this.rows.get(name);
        if (!row) return;
        row.wrap.addClass("mfl-invalid");
        row.errorEl.setText(message);
    }

    private clearFieldError(name: string): void {
        const row = this.rows.get(name);
        if (!row) return;
        row.wrap.removeClass("mfl-invalid");
        row.errorEl.setText("");
    }

    private clearAllFieldErrors(): void {
        for (const name of this.rows.keys()) this.clearFieldError(name);
    }

    /**
     * Показывает ошибки и подводит к первой. Без прокрутки на длинной форме
     * пользователь видел бы «не отправилось» и не понимал, где именно.
     */
    private showErrors(errors: Map<string, string>): void {
        this.clearAllFieldErrors();
        for (const [name, message] of errors) this.setFieldError(name, message);

        const first = [...errors.keys()][0];
        const row = first === undefined ? undefined : this.rows.get(first);
        row?.wrap.scrollIntoView({ block: "center", behavior: "smooth" });
    }

    private renderTextLike(
        setting: Setting,
        field: FieldDefinition,
        multiline: boolean,
        preset: FieldValue | undefined,
        hint: string,
    ): void {
        if (multiline) {
            setting.setClass("mfl-textarea");
            setting.addTextArea((area) => {
                if (hint !== "") area.setPlaceholder(hint);
                if (preset !== undefined) area.setValue(String(preset));
                area.onChange((value) => this.setValue(field.name, value));
            });
            return;
        }
        setting.addText((text) => {
            if (hint !== "") text.setPlaceholder(hint);
            if (preset !== undefined) text.setValue(String(preset));
            text.onChange((value) => this.setValue(field.name, value));
        });
    }

    /**
     * Варианты из запроса Dataview. Результат кешируется по значениям
     * остальных полей: подсказка спрашивает список на каждое нажатие, а
     * запрос ходит по всему хранилищу.
     */
    private dataviewOptions(fieldName: string, query: string): () => Promise<SelectOption[]> {
        let cache: { signature: string; options: SelectOption[] } | null = null;

        return async () => {
            // Своё значение из контекста убираем: список не должен зависеть
            // от того, что в этом же поле уже набрано.
            const context = { ...this.values };
            delete context[fieldName];
            const signature = JSON.stringify(context);

            if (cache !== null && cache.signature === signature) return cache.options;

            try {
                const values = await runDataviewQuery(this.app, query, context);
                cache = {
                    signature,
                    options: values.map((value) => ({ value, label: value })),
                };
            } catch (error) {
                const message =
                    error instanceof DataviewError ? error.message : t("fill.queryFailed");
                this.setFieldError(fieldName, message);
                cache = { signature, options: [] };
            }
            return cache.options;
        };
    }

    private renderMultiValue(
        setting: Setting,
        field: FieldDefinition,
        candidates: MultiValueSource,
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

        const input = field.input;
        if (input.type !== "image" && input.type !== "file") return;
        const allowed = input.type === "file" ? (input.extensions ?? []) : [];

        const control = setting.controlEl;
        const picker = control.createEl("input", { type: "file" });
        if (isImage) picker.accept = IMAGE_ACCEPT;
        else if (allowed.length > 0) picker.accept = acceptAttribute(allowed);

        const info = control.createDiv({ cls: "mfl-upload-info" });
        if (preset !== undefined) info.setText(String(preset));

        picker.addEventListener("change", async () => {
            const file = picker.files?.[0];
            if (!file) return;

            if (isImage && !isAllowedImage(file.name)) {
                info.addClass("mfl-error");
                info.setText(t("fill.imageOnly"));
                picker.value = "";
                return;
            }

            // Фильтр в системном окне обходится вводом имени руками, поэтому
            // расширение проверяем ещё раз здесь.
            if (!isAllowedExtension(file.name, allowed)) {
                info.addClass("mfl-error");
                info.setText(t("fill.extensionsOnly", { list: formatExtensions(allowed) }));
                picker.value = "";
                return;
            }

            info.removeClass("mfl-error");
            info.setText(t("fill.saving"));

            try {
                // Папка поля важнее общей: общая остаётся значением по
                // умолчанию, но форма может складывать своё отдельно.
                const fallback = isImage ? this.runtime.imageFolder : this.runtime.fileFolder;
                const folder = input.folder?.trim() || fallback;

                // Шаблон имени считаем по тому, что уже заполнено: файл
                // выбирают в середине формы, а не после её отправки.
                const named =
                    input.filenameTemplate === undefined
                        ? undefined
                        : renderTemplate(input.filenameTemplate, this.values).trim();

                const path = await saveAttachment(this.app, file, folder, named);
                this.createdAttachments.push(path);
                this.setValue(field.name, toWikiLink(path));
                info.setText(path);
            } catch (error) {
                console.error("[modal-forms-lite] не удалось сохранить вложение", error);
                info.addClass("mfl-error");
                info.setText(t("fill.saveFailed"));
                picker.value = "";
            }
        });
    }

    private setValue(name: string, value: FieldValue): void {
        this.values[name] = value;
        if (this.errorEl) this.errorEl.setText("");
        this.refreshVisibility();
    }

    /** Выполнено ли собственное условие поля. */
    private ownConditionMet(field: FieldDefinition): boolean {
        if (!field.condition) return true;
        return conditionMet(field.condition, this.values[field.condition.field]);
    }

    /**
     * Видно ли поле. Кроме своего условия учитывается условие раздела: если
     * скрыт заголовок, скрывается и всё, что под ним, иначе раздел был бы
     * просто декоративной строчкой.
     */
    private isShown(field: FieldDefinition): boolean {
        const section = this.sections.get(field.name);
        if (section && !this.ownConditionMet(section)) return false;
        return this.ownConditionMet(field);
    }

    private refreshVisibility(): void {
        for (const row of this.conditionalRows) {
            row.el.toggleClass("mfl-hidden", !this.isShown(row.field));
        }
    }

    /**
     * Пустые значения в результат не попадают — так чище frontmatter.
     * Скрытые условием поля тоже: пользователь эту ветку не выбрал, и её
     * данные были бы мусором.
     */
    private collectData(): FormData {
        const data: FormData = {};
        for (const field of this.form.fields) {
            const value = this.values[field.name];
            if (value === undefined || this.isEmpty(value)) continue;
            if (!this.isShown(field)) continue;
            data[field.name] = value;
        }
        return data;
    }

    /**
     * Поле «заметка из папки» обязано содержать существующую заметку.
     * Подсказка не мешает набрать что угодно руками, поэтому проверяем на
     * отправке: иначе в заметку уехала бы ссылка в никуда.
     */
    private unknownNotes(): string[] {
        const wrong: string[] = [];

        for (const field of this.form.fields) {
            if (field.input.type !== "note") continue;
            if (field.hidden || !this.isShown(field)) continue;

            const value = this.values[field.name];
            if (value === undefined || value === "") continue;

            const known = noteOptions(this.app, field.input.folder).some(
                (option) => option.value === String(value),
            );
            // Возвращаем идентификаторы: по ним ошибка кладётся под нужное поле.
            if (!known) wrong.push(field.name);
        }
        return wrong;
    }

    private submit(): void {
        // Ошибки собираем по полям: на длинной форме общая строка внизу не
        // отвечает на главный вопрос — где именно чинить.
        const errors = new Map<string, string>();

        for (const name of this.unknownNotes()) {
            errors.set(name, t("fill.unknownNote"));
        }

        for (const field of this.form.fields) {
            if (!this.isShown(field) || errors.has(field.name)) continue;

            if (this.isEmpty(this.values[field.name])) {
                // Про пустое поле говорим только если ответ обязателен: у
                // непустых правил к пустоте претензий нет.
                if (field.required) errors.set(field.name, t("fill.required"));
                continue;
            }

            const failure = checkValue(field, this.values[field.name]);
            if (failure !== null) errors.set(field.name, failure);
        }

        if (errors.size > 0) {
            this.showErrors(errors);
            this.errorEl?.setText(
                errors.size === 1
                    ? t("fill.oneError")
                    : t("fill.manyErrors", { count: errors.size }),
            );
            return;
        }

        this.clearAllFieldErrors();
        this.errorEl?.setText("");

        this.answer(new FormResult(this.collectData(), "ok", this.collectCleared()));
    }

    /**
     * Поля, которые были на экране и остались пустыми. Скрытые условием сюда
     * не попадают: пользователь их не видел и очистить не мог. Разделы тоже —
     * значения у них нет, а их служебное имя удалило бы одноимённый ключ
     * из чужой шапки.
     */
    private collectCleared(): string[] {
        return this.form.fields
            .filter((field) => !isDecorative(field.input.type))
            .filter((field) => !field.hidden && this.isShown(field))
            .filter((field) => this.isEmpty(this.values[field.name]))
            .map((field) => field.name);
    }

    private isEmpty(value: FieldValue | undefined): boolean {
        if (value === undefined || value === "") return true;
        // Пустой список меток — тоже незаполненное поле.
        if (Array.isArray(value) && value.length === 0) return true;
        // false у переключателя — заполненное значение, а не пропуск.
        return false;
    }

    /** Кнопка «Отмена» идёт тем же путём, что крестик: через подтверждение. */
    private cancel(): void {
        this.close();
    }

    private answer(result: FormResult): void {
        this.answered = true;
        // Форму закрыли — значит на загруженные файлы уже никто не сошлётся.
        if (!result.ok) void this.discardAttachments();
        this.resolve(result);
        this.close();
    }

    /**
     * Убирает вложения, записанные за отменённый сеанс. Отправляем в корзину,
     * а не стираем: если правило вдруг ошибётся, файл можно достать обратно.
     */
    private async discardAttachments(): Promise<void> {
        const paths = this.createdAttachments;
        this.createdAttachments = [];

        for (const path of paths) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file) continue;
            try {
                await this.app.fileManager.trashFile(file);
            } catch (error) {
                console.error("[modal-forms-lite] не удалось убрать вложение", path, error);
            }
        }
    }

    /** Начал ли пользователь заполнять форму. */
    private isDirty(): boolean {
        return JSON.stringify(this.values) !== this.snapshot;
    }

    /**
     * Сюда приходят крестик, Escape, клик мимо окна и кнопка «Отмена».
     * Если в форме уже что-то заполнено — сначала спрашиваем: данные никуда
     * не сохранены, и закрытие их потеряет.
     */
    close(): void {
        if (this.answered) {
            super.close();
            return;
        }

        if (!this.runtime.confirmDiscard || !this.isDirty()) {
            this.answer(new FormResult({}, "cancelled"));
            return;
        }

        new ConfirmModal(this.app, {
            title: t("fill.discardTitle"),
            message:
                t("fill.discardText"),
            icon: "alert-triangle",
            danger: true,
            confirmText: t("fill.discardConfirm"),
            cancelText: t("fill.discardCancel"),
            // answer() выставит признак ответа, и повторный close() уже
            // пройдёт насквозь, не спрашивая второй раз.
            onConfirm: () => this.answer(new FormResult({}, "cancelled")),
        }).open();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
