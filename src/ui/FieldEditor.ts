import { App, Setting } from "obsidian";
import { conditionNeedsValue, conditionsFor } from "../core/conditions";
import { conditionLabel, inputTypeLabel, INPUT_TYPE_ORDER } from "../core/labels";
import { isDataviewAvailable } from "../core/dataview";
import { defaultInputFor, withSource } from "../core/fields";
import type {
    ConditionKind,
    EditorContext,
    FieldDefinition,
    FieldRules,
    InputTypeName,
    SelectOption,
} from "../core/types";
import { formatExtensions, parseExtensions } from "../core/extensions";
import { isValidPattern } from "../core/patterns";
import { checkRules, hasRules, rulesFor } from "../core/rules";
import { FolderSuggest } from "./FolderSuggest";
import { restrictToLatin } from "./restrictToLatin";
import { plainGroup } from "./settingsGroup";

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
        // Тип живёт в своей карточке и вне перерисовываемого тела: при смене
        // типа тело собирается заново, а список выбора должен остаться.
        new Setting(plainGroup(container)).setName("Тип").addDropdown((dropdown) => {
            for (const type of INPUT_TYPE_ORDER) {
                // Dataview прячем, пока он не включён в настройках. Поле, уже
                // имеющее этот тип, оставляем — иначе список показал бы не то,
                // что на самом деле сохранено.
                const hidden =
                    type === "dataview" &&
                    !this.options.context.allowDataview &&
                    this.field.input.type !== "dataview";
                if (hidden) continue;
                dropdown.addOption(type, inputTypeLabel(type));
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

        // Обёртки перерисовки объявлены стопкой: карточки внутри них должны
        // стоять с тем же зазором, что и карточки самого тела поля.
        this.bodyEl = container.createDiv({ cls: "mfl-stack" });
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
            const common = input.type === "image" ? "фотографий" : "файлов";

            this.renderFolderPicker(
                container,
                "Папка для сохранения",
                input.folder ?? "",
                (path) => {
                    // Пусто означает «как в настройках»: держим это отсутствием
                    // ключа, иначе пустая строка читалась бы как корень.
                    if (path.trim() === "") delete input.folder;
                    else input.folder = path.trim();
                },
                `Пусто — общая папка из настроек плагина, «Место сохранения ${common}»`,
            );

            new Setting(container)
                .setName("Шаблон имени файла")
                .setDesc("Пусто — имя останется исходным. Понимает {{поле}} этой же формы")
                .addText((text) =>
                    text
                        .setPlaceholder("например, {{title}}-обложка")
                        .setValue(input.filenameTemplate ?? "")
                        .onChange((value) => {
                            if (value.trim() === "") delete input.filenameTemplate;
                            else input.filenameTemplate = value.trim();
                        }),
                );

            if (input.type === "file") {
                new Setting(container)
                    .setName("Допустимые расширения")
                    .setDesc("Через запятую. Пусто — любые")
                    .addText((text) =>
                        text
                            .setPlaceholder("pdf, docx, zip")
                            .setValue(formatExtensions(input.extensions ?? []))
                            .onChange((value) => {
                                const extensions = parseExtensions(value);
                                if (extensions.length === 0) delete input.extensions;
                                else input.extensions = extensions;
                            }),
                    );
            }
            return;
        }

        if (input.type === "dataview") {
            this.renderQuery(container, input.query, (query) => {
                input.query = query;
            });
            return;
        }

        if (input.type === "tag") {
            new Setting(container)
                .setName("Источник подсказок")
                .setDesc("Теги, уже встречающиеся в хранилище. Свои тоже можно вводить");

            // Регулярное выражение, а не список имён: служебные теги обычно
            // растут ветками, и «^archive/» отсекает ветку целиком.
            const warning = container.createDiv({ cls: "mfl-warning" });
            const check = (pattern: string): void => {
                warning.setText(
                    isValidPattern(pattern) ? "" : "Выражение не разбирается — отбор не сработает",
                );
            };
            check(input.exclude ?? "");

            new Setting(container)
                .setName("Не предлагать теги")
                .setDesc("Регулярное выражение. Например, ^archive/ уберёт всю ветку archive")
                .addText((text) =>
                    text
                        .setPlaceholder("^archive/")
                        .setValue(input.exclude ?? "")
                        .onChange((value) => {
                            if (value.trim() === "") delete input.exclude;
                            else input.exclude = value.trim();
                            check(value);
                            this.clearError();
                        }),
                );
            return;
        }

        if (input.type === "folder") {
            this.renderFolderPicker(
                container,
                "Выбирать внутри папки",
                input.parent ?? "",
                (path) => {
                    if (path.trim() === "") delete input.parent;
                    else input.parent = path.trim();
                },
                "Пусто — можно выбрать любую папку хранилища",
            );
            return;
        }

        if (input.type === "select" || input.type === "multiselect") {
            const kind = input.type;
            new Setting(container).setName("Источник").addDropdown((dropdown) => {
                dropdown.addOption("fixed", "Заданный список");
                dropdown.addOption("notes", "Заметки из папки");

                // Запрос как источник есть только у множественного выбора и
                // только при включённом Dataview. Уже выбранный оставляем
                // видимым, иначе список показал бы не то, что сохранено.
                const allowQuery =
                    kind === "multiselect" &&
                    (this.options.context.allowDataview || input.source === "dataview");
                if (allowQuery) dropdown.addOption("dataview", "Запрос Dataview");

                dropdown.setValue(input.source).onChange((value) => {
                    this.field.input = withSource(
                        kind,
                        value === "notes" || value === "dataview" ? value : "fixed",
                    );
                    this.renderInputOptions();
                    this.clearError();
                });
            });

            if (input.source === "dataview") {
                this.renderQuery(container, input.query, (query) => {
                    input.query = query;
                });
                return;
            }

            if (input.source === "notes") {
                // У множественного выбора папок может быть несколько: списки
                // вроде «участники» часто собираются из двух-трёх мест.
                if (input.type === "multiselect") this.renderNoteFolders(container, input);
                else {
                    this.renderFolderPicker(
                        container,
                        "Папка с заметками",
                        input.folder,
                        (path) => {
                            input.folder = path;
                        },
                    );
                }
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
            type === "folder" ||
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
        const main = plainGroup(container);

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

            const behavior = plainGroup(container);

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
            ? plainGroup(container)
            : container.createDiv({ cls: "mfl-stack" });
        this.renderInputOptions();

        if (!isSection) this.renderRules(container);

        this.conditionEl = container.createDiv({ cls: "mfl-stack" });
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

        const container = plainGroup(host);

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
            // Пояснение переехало сюда из заголовка группы: заголовков в
            // настройках поля больше нет, а знать про это правило важно.
            .setDesc(isSection ? "Скрытый раздел уносит все поля до следующего" : "")
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
                    dropdown.addOption(kind, conditionLabel(kind));
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

    /**
     * Проверки ответа. Показываем только те, что осмысленны для типа: у числа
     * не бывает длины, у текста — границ значения.
     */
    private renderRules(container: HTMLElement): void {
        const type = this.field.input.type;
        if (!hasRules(type)) return;

        const allowed = rulesFor(type);
        const rules: FieldRules = this.field.rules ?? {};
        const group = plainGroup(container);

        // Правила живут на поле только пока в них что-то есть: пустой объект
        // в data.json — мусор, который потом приходится объяснять.
        const save = (): void => {
            const filled = Object.entries(rules).some(
                ([, value]) => value !== undefined && value !== "",
            );
            if (filled) this.field.rules = rules;
            else delete this.field.rules;
            this.clearError();
        };

        const numberRow = (key: "min" | "max" | "minLength" | "maxLength", name: string): void => {
            if (!allowed.includes(key)) return;
            new Setting(group).setName(name).addText((text) => {
                text.inputEl.type = "number";
                text.setValue(rules[key] === undefined ? "" : String(rules[key]));
                text.onChange((value) => {
                    const parsed = Number(value);
                    if (value.trim() === "" || !Number.isFinite(parsed)) delete rules[key];
                    else rules[key] = parsed;
                    save();
                });
            });
        };

        const countable = type === "multiselect" || type === "tag";
        numberRow("min", "Не меньше");
        numberRow("max", "Не больше");
        numberRow("minLength", countable ? "Значений не меньше" : "Символов не меньше");
        numberRow("maxLength", countable ? "Значений не больше" : "Символов не больше");

        if (allowed.includes("pattern")) {
            new Setting(group)
                .setName("Соответствует выражению")
                .setDesc("Регулярное выражение. Например, ^\\d{4}$ — ровно четыре цифры")
                .addText((text) =>
                    text
                        .setPlaceholder("^\\d{4}$")
                        .setValue(rules.pattern ?? "")
                        .onChange((value) => {
                            if (value.trim() === "") delete rules.pattern;
                            else rules.pattern = value.trim();
                            save();
                            check();
                        }),
                );
        }

        new Setting(group)
            .setName("Сообщение об ошибке")
            .setDesc("Пусто — плагин напишет сам. Выражение словами не объяснит")
            .addText((text) =>
                text
                    .setPlaceholder("Год из четырёх цифр")
                    .setValue(rules.message ?? "")
                    .onChange((value) => {
                        if (value.trim() === "") delete rules.message;
                        else rules.message = value.trim();
                        save();
                    }),
            );

        // Ошибку самих правил показываем сразу: «минимум больше максимума»
        // всплыло бы иначе только при заполнении формы.
        const warning = group.createDiv({ cls: "mfl-warning" });
        const check = (): void => warning.setText(checkRules(this.field.rules) ?? "");
        check();
    }

    /**
     * Запрос Dataview. Один и тот же для одиночного поля и для источника
     * множественного выбора: пишется он одинаково и одинаково исполняется.
     */
    private renderQuery(
        container: HTMLElement,
        query: string,
        onChange: (query: string) => void,
    ): void {
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
                    .setValue(query)
                    .onChange((value) => {
                        onChange(value);
                        this.clearError();
                    }),
            );
    }

    /**
     * Источники множественного выбора: основная папка и сколько угодно
     * дополнительных. Пустые строки и повторы отсюда не убираем — человек
     * может добавить строку и уйти думать; чистит их сохранение формы.
     */
    private renderNoteFolders(
        container: HTMLElement,
        input: { folder: string; folders?: string[] },
    ): void {
        this.renderFolderPicker(
            container,
            "Папка с заметками",
            input.folder,
            (path) => {
                input.folder = path;
            },
            "Пусто — заметки всего хранилища",
        );

        const extra = input.folders ?? [];
        extra.forEach((folder, index) => {
            const setting = new Setting(container).setName("Ещё папка");
            setting.addText((text) => {
                text.setPlaceholder("Люди")
                    .setValue(folder)
                    .onChange((value) => {
                        extra[index] = value;
                        this.clearError();
                    });
                new FolderSuggest(this.app, text.inputEl, (path) => {
                    extra[index] = path;
                    text.setValue(path);
                    this.clearError();
                });
            });
            setting.addExtraButton((button) =>
                button
                    .setIcon("trash-2")
                    .setTooltip("Убрать папку")
                    .onClick(() => {
                        extra.splice(index, 1);
                        if (extra.length === 0) delete input.folders;
                        this.renderInputOptions();
                    }),
            );
        });

        new Setting(container).addButton((button) =>
            button.setButtonText("Добавить папку").onClick(() => {
                input.folders = [...extra, ""];
                this.renderInputOptions();
            }),
        );
    }

    private renderFolderPicker(
        container: HTMLElement,
        name: string,
        value: string,
        onChange: (path: string) => void,
        description = "Начните вводить или выберите из списка",
    ): void {
        new Setting(container)
            .setName(name)
            .setDesc(description)
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
