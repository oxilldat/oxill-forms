import { App, Modal, Setting } from "obsidian";
import {
    CONDITION_LABELS,
    conditionNeedsValue,
    conditionsFor,
} from "../core/conditions";
import { isDataviewAvailable } from "../core/dataview";
import { defaultInputFor, validateField, withSource } from "../core/fields";
import { INPUT_TYPE_LABELS } from "../core/types";
import type {
    ConditionKind,
    EditorContext,
    FieldDefinition,
    InputTypeName,
    SelectOption,
} from "../core/types";
import { ConfirmModal } from "./ConfirmModal";
import { FolderSuggest } from "./FolderSuggest";
import { restrictToLatin } from "./restrictToLatin";

interface FieldEditorOptions {
    field: FieldDefinition;
    /** Остальные поля формы — по ним проверяется уникальность идентификатора. */
    otherFields: FieldDefinition[];
    context: EditorContext;
    isNew?: boolean;
    /**
     * `previousName` приходит, только если идентификатор поменяли у уже
     * существующего поля: по нему форма поймёт, что заметки надо починить.
     */
    onSubmit: (field: FieldDefinition, previousName?: string) => void;
}

/**
 * Окно создания и правки одного поля. Работает с копией: пока не нажата
 * кнопка сохранения, форма-владелец о правках не знает.
 */
export class FieldEditorModal extends Modal {
    private draft: FieldDefinition;
    /** Слепок при открытии — по нему понимаем, были ли правки. */
    private readonly snapshot: string;
    private mayClose = false;
    private optionsEl: HTMLElement | null = null;
    private conditionEl: HTMLElement | null = null;
    private errorEl: HTMLElement | null = null;

    constructor(
        app: App,
        private options: FieldEditorOptions,
    ) {
        super(app);
        this.draft = structuredClone(options.field);
        this.snapshot = JSON.stringify(this.draft);
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
                this.clearError();
            }),
        );

        new Setting(contentEl)
            .setName("Скрытое")
            .setDesc(
                "В форме не показывается. Значение передаётся из кода через " +
                    "openForm(..., { values }) и попадает в результат",
            )
            .addToggle((toggle) =>
                toggle.setValue(this.draft.hidden === true).onChange((value) => {
                    this.draft.hidden = value;
                    this.clearError();
                    this.renderCondition();
                }),
            );

        new Setting(contentEl).setName("Тип").addDropdown((dropdown) => {
            for (const [type, label] of Object.entries(INPUT_TYPE_LABELS)) {
                // Dataview прячем, пока он не включён в настройках. Поле, уже
                // имеющее этот тип, оставляем — иначе список показал бы не то,
                // что на самом деле сохранено.
                const hidden =
                    type === "dataview" &&
                    !this.options.context.allowDataview &&
                    this.draft.input.type !== "dataview";
                if (hidden) continue;
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

        this.conditionEl = contentEl.createDiv();
        this.renderCondition();

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

        if (input.type === "dataview") {
            if (!isDataviewAvailable(this.app)) {
                container.createDiv({
                    cls: "mfl-warning",
                    text: "Плагин Dataview не установлен или отключён — список будет пустым",
                });
            }

            new Setting(container)
                .setClass("mfl-textarea")
                .setName("Запрос")
                .setDesc(
                    'Выражение на JS. Доступны dv, pages и form — значения формы. Пример: dv.pages(\'"Люди"\').map(p => p.file.name)',
                )
                .addTextArea((area) =>
                    area
                        .setPlaceholder('dv.pages(\'"Люди"\').map(p => p.file.name)')
                        .setValue(input.query)
                        .onChange((value) => {
                            input.query = value;
                            this.clearError();
                        }),
                );
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

    /**
     * Условие показа. Зависеть можно только от полей, объявленных выше в
     * форме, — иначе на момент проверки значения ещё нет.
     */
    private renderCondition(): void {
        const container = this.conditionEl;
        if (!container) return;
        container.empty();

        if (this.draft.hidden) return;

        const candidates = this.options.otherFields;
        if (candidates.length === 0) {
            new Setting(container)
                .setName("Показывать поле")
                .setDesc("Условие можно задать, когда в форме есть другие поля");
            return;
        }

        const condition = this.draft.condition;

        new Setting(container)
            .setName("Показывать поле")
            .addDropdown((dropdown) => {
                dropdown.addOption("always", "Всегда");
                dropdown.addOption("conditional", "При условии");
                dropdown.setValue(condition ? "conditional" : "always").onChange((value) => {
                    if (value === "always") {
                        delete this.draft.condition;
                    } else {
                        const first = candidates[0];
                        if (!first) return;
                        const kinds = conditionsFor(first.input.type);
                        this.draft.condition = {
                            field: first.name,
                            kind: kinds[0] ?? "isSet",
                        };
                    }
                    this.clearError();
                    this.renderCondition();
                });
            });

        if (!condition) return;

        const dependency =
            candidates.find((field) => field.name === condition.field) ?? candidates[0];
        if (!dependency) return;

        const kinds = conditionsFor(dependency.input.type);

        new Setting(container).setClass("mfl-condition").setName("Когда поле").addDropdown(
            (dropdown) => {
                for (const field of candidates) {
                    dropdown.addOption(field.name, field.label?.trim() || field.name);
                }
                dropdown.setValue(dependency.name).onChange((value) => {
                    const next = candidates.find((field) => field.name === value);
                    if (!next) return;
                    const allowed = conditionsFor(next.input.type);
                    // Условия зависят от типа: при смене поля старое могло стать
                    // неприменимым, поэтому берём первое подходящее.
                    condition.field = value;
                    if (!allowed.includes(condition.kind)) {
                        condition.kind = allowed[0] ?? "isSet";
                        delete condition.value;
                    }
                    this.clearError();
                    this.renderCondition();
                });
            },
        );

        new Setting(container).setClass("mfl-condition").setName("Условие").addDropdown(
            (dropdown) => {
                for (const kind of kinds) {
                    dropdown.addOption(kind, CONDITION_LABELS[kind]);
                }
                dropdown.setValue(condition.kind).onChange((value) => {
                    condition.kind = value as ConditionKind;
                    if (!conditionNeedsValue(condition.kind)) delete condition.value;
                    this.clearError();
                    this.renderCondition();
                });
            },
        );

        if (!conditionNeedsValue(condition.kind)) return;

        const numeric =
            dependency.input.type === "number" || dependency.input.type === "slider";

        new Setting(container).setClass("mfl-condition").setName("Значение").addText((text) => {
            if (numeric) text.inputEl.type = "number";
            text.setValue(condition.value === undefined ? "" : String(condition.value)).onChange(
                (entered) => {
                    if (numeric) {
                        const parsed = Number(entered);
                        condition.value = Number.isFinite(parsed) ? parsed : 0;
                    } else {
                        condition.value = entered;
                    }
                    this.clearError();
                },
            );
        });
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

        this.mayClose = true;
        this.close();

        const before = this.options.field.name;
        const renamed = !this.options.isNew && before !== "" && before !== this.draft.name;
        this.options.onSubmit(this.draft, renamed ? before : undefined);
    }

    private isDirty(): boolean {
        return JSON.stringify(this.draft) !== this.snapshot;
    }

    /** Как и в редакторе формы: несохранённые правки не теряем молча. */
    close(): void {
        if (this.mayClose || !this.options.context.confirmDiscard || !this.isDirty()) {
            super.close();
            return;
        }

        new ConfirmModal(this.app, {
            title: "Закрыть без сохранения?",
            message:
                "Настройки поля не сохранены и будут потеряны. " +
                `Вернитесь и нажмите «${this.options.isNew ? "Добавить" : "Сохранить"}», чтобы их оставить.`,
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
