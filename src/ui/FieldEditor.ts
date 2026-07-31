import { App, Setting } from "obsidian";
import { conditionNeedsValue, conditionsFor } from "../core/conditions";
import { conditionLabel, inputTypeLabel, INPUT_TYPE_ORDER } from "../core/labels";
import { isDataviewAvailable } from "../core/dataview";
import { t } from "../i18n";
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
        new Setting(plainGroup(container)).setName(t("field.type")).addDropdown((dropdown) => {
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
            this.renderFolderPicker(container, t("field.notesFolder"), input.folder, (path) => {
                input.folder = path;
            });
            return;
        }

        if (input.type === "slider") {
            this.renderNumber(container, t("field.min"), input.min, (value) => {
                input.min = value;
            });
            this.renderNumber(container, t("field.max"), input.max, (value) => {
                input.max = value;
            });
            this.renderNumber(container, t("field.step"), input.step, (value) => {
                input.step = value;
            });
            return;
        }

        if (input.type === "image" || input.type === "file") {

            this.renderFolderPicker(
                container,
                t("field.saveFolder"),
                input.folder ?? "",
                (path) => {
                    // Пусто означает «как в настройках»: держим это отсутствием
                    // ключа, иначе пустая строка читалась бы как корень.
                    if (path.trim() === "") delete input.folder;
                    else input.folder = path.trim();
                },
                input.type === "image"
                    ? t("field.saveFolderDescImage")
                    : t("field.saveFolderDescFile"),
            );

            new Setting(container)
                .setName(t("field.filenameTemplate"))
                .setDesc(t("field.filenameTemplateDesc"))
                .addText((text) =>
                    text
                        .setPlaceholder(t("field.filenameTemplateExample"))
                        .setValue(input.filenameTemplate ?? "")
                        .onChange((value) => {
                            if (value.trim() === "") delete input.filenameTemplate;
                            else input.filenameTemplate = value.trim();
                        }),
                );

            if (input.type === "file") {
                new Setting(container)
                    .setName(t("field.extensions"))
                    .setDesc(t("field.extensionsDesc"))
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
                .setName(t("field.tagSource"))
                .setDesc(t("field.tagSourceDesc"));

            // Регулярное выражение, а не список имён: служебные теги обычно
            // растут ветками, и «^archive/» отсекает ветку целиком.
            const warning = container.createDiv({ cls: "mfl-warning" });
            const check = (pattern: string): void => {
                warning.setText(
                    isValidPattern(pattern) ? "" : t("field.patternBroken"),
                );
            };
            check(input.exclude ?? "");

            new Setting(container)
                .setName(t("field.tagExclude"))
                .setDesc(t("field.tagExcludeDesc"))
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
                t("field.folderParent"),
                input.parent ?? "",
                (path) => {
                    if (path.trim() === "") delete input.parent;
                    else input.parent = path.trim();
                },
                t("field.folderParentDesc"),
            );
            return;
        }

        if (input.type === "select" || input.type === "multiselect") {
            const kind = input.type;
            new Setting(container).setName(t("field.source")).addDropdown((dropdown) => {
                dropdown.addOption("fixed", t("field.sourceFixed"));
                dropdown.addOption("notes", t("field.sourceNotes"));

                // Запрос как источник есть только у множественного выбора и
                // только при включённом Dataview. Уже выбранный оставляем
                // видимым, иначе список показал бы не то, что сохранено.
                const allowQuery =
                    kind === "multiselect" &&
                    (this.options.context.allowDataview || input.source === "dataview");
                if (allowQuery) dropdown.addOption("dataview", t("field.sourceQuery"));

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
                        t("field.notesFolder"),
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
                button.setButtonText(t("field.addOption")).onClick(() => {
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
                .setName(t("field.name"))
                .setDesc(t("field.nameDesc"))
                .addText((text) => {
                    text.setPlaceholder("A - z").setValue(this.field.name);
                    restrictToLatin(text.inputEl, (value) => {
                        this.field.name = value;
                        this.clearError();
                    });
                });
        }

        new Setting(main)
            .setName(isSection ? t("field.sectionTitle") : t("field.label"))
            .addText((text) =>
                text
                    .setPlaceholder(isSection ? t("field.sectionPlaceholder") : t("field.labelPlaceholder"))
                    .setValue(this.field.label ?? "")
                    .onChange((value) => {
                        this.field.label = value;
                    }),
            );

        new Setting(main).setName(t("field.description")).addText((text) =>
            text
                .setPlaceholder(t("field.descriptionPlaceholder"))
                .setValue(this.field.description ?? "")
                .onChange((value) => {
                    this.field.description = value;
                }),
        );

        if (!isSection) {
            new Setting(main)
                .setName(t("field.placeholder"))
                .setDesc(t("field.placeholderDesc"))
                .addText((text) =>
                    text
                        .setPlaceholder(t("field.placeholderExample"))
                        .setValue(this.field.placeholder ?? "")
                        .onChange((value) => {
                            this.field.placeholder = value;
                        }),
                );

            new Setting(main)
                .setName(t("field.default"))
                .setDesc(
                    t("field.defaultDesc"),
                )
                .addText((text) =>
                    text
                        .setPlaceholder(t("field.defaultExample"))
                        .setValue(this.field.default ?? "")
                        .onChange((value) => {
                            this.field.default = value;
                        }),
                );

            const behavior = plainGroup(container);

            new Setting(behavior).setName(t("field.required")).addToggle((toggle) =>
                toggle.setValue(this.field.required === true).onChange((value) => {
                    this.field.required = value;
                    this.clearError();
                }),
            );

            new Setting(behavior)
                .setName(t("field.hidden"))
                .setDesc(
                    t("field.hiddenDesc"),
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

        const container = plainGroup(host);

        // Раздел не хранит значения, поэтому зависеть от него бессмысленно.
        const candidates = this.options.otherFields.filter(
            (field) => field.input.type !== "section",
        );
        if (candidates.length === 0) {
            new Setting(container)
                .setName(isSection ? t("field.showSection") : t("field.showField"))
                .setDesc(t("field.conditionNeedsOthers"));
            return;
        }

        const condition = this.field.condition;

        new Setting(container)
            .setName(isSection ? t("field.showSection") : t("field.showField"))
            // Пояснение переехало сюда из заголовка группы: заголовков в
            // настройках поля больше нет, а знать про это правило важно.
            .setDesc(isSection ? t("field.sectionConditionDesc") : "")
            .addDropdown((dropdown) => {
                dropdown.addOption("always", t("field.always"));
                dropdown.addOption("conditional", t("field.conditional"));
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

        new Setting(container).setClass("mfl-condition").setName(t("field.whenField")).addDropdown(
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

        new Setting(container).setClass("mfl-condition").setName(t("field.condition")).addDropdown(
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

        new Setting(container).setClass("mfl-condition").setName(t("field.value")).addText((text) => {
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
        numberRow("min", t("field.ruleMin"));
        numberRow("max", t("field.ruleMax"));
        numberRow("minLength", countable ? t("field.ruleMinCount") : t("field.ruleMinLength"));
        numberRow("maxLength", countable ? t("field.ruleMaxCount") : t("field.ruleMaxLength"));

        if (allowed.includes("pattern")) {
            new Setting(group)
                .setName(t("field.rulePattern"))
                .setDesc(t("field.rulePatternDesc"))
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
            .setName(t("field.ruleMessage"))
            .setDesc(t("field.ruleMessageDesc"))
            .addText((text) =>
                text
                    .setPlaceholder(t("field.ruleMessageExample"))
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
                text: t("field.dataviewMissing"),
            });
        }

        new Setting(container)
            .setClass("mfl-textarea")
            .setName(t("field.query"))
            .setDesc(
                t("field.queryDesc"),
            )
            .addTextArea((area) =>
                area
                    .setPlaceholder(t("field.queryExample"))
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
            t("field.notesFolder"),
            input.folder,
            (path) => {
                input.folder = path;
            },
            t("field.notesFolderAll"),
        );

        const extra = input.folders ?? [];
        extra.forEach((folder, index) => {
            const setting = new Setting(container).setName(t("field.moreFolder"));
            setting.addText((text) => {
                text.setPlaceholder(t("field.peopleExample"))
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
                    .setTooltip(t("field.removeFolder"))
                    .onClick(() => {
                        extra.splice(index, 1);
                        if (extra.length === 0) delete input.folders;
                        this.renderInputOptions();
                    }),
            );
        });

        new Setting(container).addButton((button) =>
            button.setButtonText(t("field.addFolder")).onClick(() => {
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
        description = t("field.folderHint"),
    ): void {
        new Setting(container)
            .setName(name)
            .setDesc(description)
            .addText((text) => {
                text.setPlaceholder(t("field.folderExample"))
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
                .setPlaceholder(t("field.optionValue"))
                .setValue(option.value)
                .onChange((value) => {
                    option.value = value;
                    this.clearError();
                }),
        );
        row.addText((text) =>
            text
                .setPlaceholder(t("field.optionLabel"))
                .setValue(option.label)
                .onChange((value) => {
                    option.label = value;
                }),
        );
        row.addExtraButton((button) =>
            button
                .setIcon("trash-2")
                .setTooltip(t("field.removeOption"))
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
