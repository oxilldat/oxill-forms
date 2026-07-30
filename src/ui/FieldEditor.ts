import { App, Setting } from "obsidian";
import {
    CONDITION_LABELS,
    conditionNeedsValue,
    conditionsFor,
} from "../core/conditions";
import { isDataviewAvailable } from "../core/dataview";
import { defaultInputFor, withSource } from "../core/fields";
import { INPUT_TYPE_LABELS } from "../core/types";
import type {
    ConditionKind,
    EditorContext,
    FieldDefinition,
    InputTypeName,
    SelectOption,
} from "../core/types";
import { FolderSuggest } from "./FolderSuggest";
import { restrictToLatin } from "./restrictToLatin";
import { settingsGroup } from "./settingsGroup";

interface FieldEditorOptions {
    field: FieldDefinition;
    /** Остальные поля формы — по ним проверяется уникальность идентификатора. */
    otherFields: FieldDefinition[];
    context: EditorContext;
    /** Дёргается на любую правку: владелец обновляет заголовок строки и гасит ошибку. */
    onChange: () => void;
}

/**
 * Настройки одного поля. Не окно: рисуется прямо внутри развёрнутой строки
 * списка полей и правит поле на месте. Отдельного сохранения нет — за него
 * отвечает кнопка «Сохранить» у самой формы.
 */
export class FieldEditor {
    private readonly field: FieldDefinition;
    private bodyEl: HTMLElement | null = null;
    private optionsEl: HTMLElement | null = null;
    private conditionEl: HTMLElement | null = null;

    constructor(
        private app: App,
        private options: FieldEditorOptions,
    ) {
        this.field = options.field;
    }

    render(container: HTMLElement): void {
        new Setting(container).setName("Тип").addDropdown((dropdown) => {
            for (const [type, label] of Object.entries(INPUT_TYPE_LABELS)) {
                // Dataview прячем, пока он не включён в настройках. Поле, уже
                // имеющее этот тип, оставляем — иначе список показал бы не то,
                // что на самом деле сохранено.
                const hidden =
                    type === "dataview" &&
                    !this.options.context.allowDataview &&
                    this.field.input.type !== "dataview";
                if (hidden) continue;
                dropdown.addOption(type, label);
            }
            dropdown.setValue(this.field.input.type).onChange((value) => {
                // Настройки старого типа несовместимы с новым — сбрасываем.
                this.field.input = defaultInputFor(value as InputTypeName);
                this.clearError();
                // Раздел и обычное поле настраиваются по-разному, поэтому
                // при смене типа перерисовываем всё, а не только настройки.
                this.renderBody();
            });
        });

        this.bodyEl = container.createDiv();
        this.renderBody();
    }

    /** Настройки, специфичные для выбранного типа. */
    private renderInputOptions(): void {
        const container = this.optionsEl;
        if (!container) return;
        container.empty();

        const input = this.field.input;

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
                    this.field.input = withSource(kind, value === "notes" ? "notes" : "fixed");
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

    /** Типы, у которых есть собственные настройки под выпадающим списком. */
    private hasTypeOptions(): boolean {
        const type = this.field.input.type;
        return (
            type === "select" ||
            type === "multiselect" ||
            type === "note" ||
            type === "slider" ||
            type === "dataview" ||
            type === "tag" ||
            type === "image" ||
            type === "file"
        );
    }

    /**
     * Всё, кроме выбора типа. Разделу не нужны ни идентификатор, ни
     * обязательность — у него нет значения, он только заголовок.
     */
    private renderBody(): void {
        const container = this.bodyEl;
        if (!container) return;
        container.empty();

        const isSection = this.field.input.type === "section";
        const main = settingsGroup(container, "Основное");

        if (!isSection) {
            new Setting(main)
                .setName("Идентификатор")
                .setDesc("Ключ в результате формы. Только латинские буквы")
                .addText((text) => {
                    text.setPlaceholder("A - z").setValue(this.field.name);
                    restrictToLatin(text.inputEl, (value) => {
                        this.field.name = value;
                        this.clearError();
                    });
                });
        }

        new Setting(main)
            .setName(isSection ? "Заголовок раздела" : "Подпись")
            .addText((text) =>
                text
                    .setPlaceholder(isSection ? "например, Оценка" : "Что видит пользователь")
                    .setValue(this.field.label ?? "")
                    .onChange((value) => {
                        this.field.label = value;
                    }),
            );

        new Setting(main).setName("Описание").addText((text) =>
            text
                .setPlaceholder("Пояснение под подписью")
                .setValue(this.field.description ?? "")
                .onChange((value) => {
                    this.field.description = value;
                }),
        );

        if (!isSection) {
            new Setting(main)
                .setName("Подсказка в поле")
                .setDesc("Серый текст внутри пустого поля")
                .addText((text) =>
                    text
                        .setPlaceholder("например, фамилия и имя")
                        .setValue(this.field.placeholder ?? "")
                        .onChange((value) => {
                            this.field.placeholder = value;
                        }),
                );

            new Setting(main)
                .setName("Значение по умолчанию")
                .setDesc(
                    "Чем поле заполнено при открытии. Понимает {{today}}, {{now}}, {{datetime}}",
                )
                .addText((text) =>
                    text
                        .setPlaceholder("например, {{today}}")
                        .setValue(this.field.default ?? "")
                        .onChange((value) => {
                            this.field.default = value;
                        }),
                );

            const behavior = settingsGroup(container, "Поведение");

            new Setting(behavior).setName("Обязательное").addToggle((toggle) =>
                toggle.setValue(this.field.required === true).onChange((value) => {
                    this.field.required = value;
                    this.clearError();
                }),
            );

            new Setting(behavior)
                .setName("Скрытое")
                .setDesc(
                    "В форме не показывается. Значение передаётся из кода через " +
                        "openForm(..., { values }) и попадает в результат",
                )
                .addToggle((toggle) =>
                    toggle.setValue(this.field.hidden === true).onChange((value) => {
                        this.field.hidden = value;
                        this.clearError();
                        this.renderCondition();
                    }),
                );
        }

        // У типов без своих настроек карточку не заводим — она была бы пустой.
        this.optionsEl = this.hasTypeOptions()
            ? settingsGroup(container, "Настройки типа")
            : container.createDiv();
        this.renderInputOptions();

        this.conditionEl = container.createDiv();
        this.renderCondition();
    }

    /**
     * Условие показа. Зависеть можно только от полей, объявленных выше в
     * форме, — иначе на момент проверки значения ещё нет.
     */
    private renderCondition(): void {
        const host = this.conditionEl;
        if (!host) return;
        host.empty();

        if (this.field.hidden) return;

        const isSection = this.field.input.type === "section";
        const what = isSection ? "раздел" : "поле";

        const container = settingsGroup(
            host,
            "Условие показа",
            isSection ? "Скрытый раздел уносит с собой все поля до следующего раздела" : undefined,
        );

        // Раздел не хранит значения, поэтому зависеть от него бессмысленно.
        const candidates = this.options.otherFields.filter(
            (field) => field.input.type !== "section",
        );
        if (candidates.length === 0) {
            new Setting(container)
                .setName(`Показывать ${what}`)
                .setDesc("Условие можно задать, когда в форме есть другие поля");
            return;
        }

        const condition = this.field.condition;

        new Setting(container)
            .setName(`Показывать ${what}`)
            .addDropdown((dropdown) => {
                dropdown.addOption("always", "Всегда");
                dropdown.addOption("conditional", "При условии");
                dropdown.setValue(condition ? "conditional" : "always").onChange((value) => {
                    if (value === "always") {
                        delete this.field.condition;
                    } else {
                        const first = candidates[0];
                        if (!first) return;
                        const kinds = conditionsFor(first.input.type);
                        this.field.condition = {
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

    /** Правка любого поля гасит ошибку формы и обновляет заголовок строки. */
    private clearError(): void {
        this.options.onChange();
    }
}
