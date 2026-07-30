import { App, Modal, Setting, setIcon, TextComponent } from "obsidian";
import { DEFAULT_FORM_ICON } from "../core/formFolders";
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
import { IconSuggest } from "./IconSuggest";
import { restrictToLatin } from "./restrictToLatin";
import { collapsibleGroup, settingsGroup } from "./settingsGroup";
import { ValueSuggest } from "./ValueSuggest";

export interface FormMeta {
    name: string;
    title: string;
    folder?: string;
    icon?: string;
    command?: FormCommand;
    template?: string;
}

interface FormMetaOptions {
    /** Если передана — режим правки, иначе создание. */
    form?: FormDefinition;
    /** Уже существующие папки — для подсказки, чтобы не плодить опечатки. */
    folders: string[];
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
    private folder: string;
    private icon: string;
    private command: FormCommand;
    private template: string;
    private iconPreview: HTMLElement | null = null;
    private readonly fields: FieldDefinition[];
    private commandEl: HTMLElement | null = null;
    private templateInput: HTMLTextAreaElement | null = null;
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
        this.folder = options.form?.folder ?? "";
        this.icon = options.form?.icon ?? "";
        this.template = options.form?.template ?? "";
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

        const main = settingsGroup(contentEl, "Основное");

        new Setting(main)
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

        new Setting(main)
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

        const look = settingsGroup(contentEl, "Вид в списке форм");

        new Setting(look)
            .setName("Папка")
            .setDesc("Ярлык для группировки в списке форм. Пусто — форма без папки")
            .addText((text) => {
                text.setPlaceholder("например, Чтение")
                    .setValue(this.folder)
                    .onChange((value) => {
                        this.folder = value;
                    });
                new ValueSuggest(
                    this.app,
                    text.inputEl,
                    () => this.options.folders.map((name) => ({ value: name, label: name })),
                    (value) => {
                        this.folder = value;
                        text.setValue(value);
                    },
                );
            });

        const iconSetting = new Setting(look)
            .setName("Иконка")
            .setDesc("Показывается на карточке формы");

        // Предпросмотр — обычный значок перед полем, а не отключённая кнопка:
        // кнопкой он выглядел как управление, по которому нечего нажимать.
        this.iconPreview = iconSetting.controlEl.createSpan({ cls: "mfl-icon-badge" });
        this.renderIconPreview();

        iconSetting.addText((text) => {
                text.setPlaceholder(DEFAULT_FORM_ICON)
                    .setValue(this.icon)
                    .onChange((value) => {
                        this.icon = value.trim();
                        this.renderIconPreview();
                    });
                new IconSuggest(this.app, text.inputEl, (icon) => {
                    this.icon = icon;
                    this.renderIconPreview();
                });
            });

        const commandGroup = settingsGroup(contentEl, "Команда в палитре");

        new Setting(commandGroup)
            .setName("Добавить команду")
            .setDesc("В палитре появится «Заполнить: …»")
            .addToggle((toggle) =>
                toggle.setValue(this.command.enabled).onChange((value) => {
                    this.command.enabled = value;
                    this.clearError();
                    this.renderCommand();
                }),
            );

        // Настройки режима дорисовываются в ту же карточку.
        this.commandEl = commandGroup.createDiv();
        this.renderCommand();

        // Шаблон занимает больше места, чем все прочие группы вместе, и нужен
        // не всегда: пустой — свёрнут, заполненный — сразу раскрыт.
        const templateGroup = collapsibleGroup(
            contentEl,
            "Шаблон заметки",
            "Вид заметки с подстановками. Пусто — используется формат выше. " +
                "Особые: {{frontmatter}} — вся шапка разом, {{cursor}} — куда встанет курсор",
            this.template.trim() !== "",
        );

        this.renderFieldHints(templateGroup);

        // Не Setting: у строки настроек левая половина отведена под подпись,
        // а подписи здесь нет — поле ютилось бы справа при пустом левом столбце.
        const area = templateGroup.createEl("textarea", { cls: "mfl-template-input" });
        area.rows = 10;
        area.placeholder = "---\n{{frontmatter}}\n---\n\n# {{ title }}\n";
        area.value = this.template;
        area.addEventListener("input", () => {
            this.template = area.value;
        });
        this.templateInput = area;

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
            if (event.key !== "Enter" || event.isComposing) return;

            // В шаблоне Enter переносит строку — это его основная работа.
            // Отправка оттуда только с модификатором, как в самой форме.
            const inTextarea = event.target instanceof HTMLTextAreaElement;
            if (inTextarea && !(event.ctrlKey || event.metaKey)) return;

            event.preventDefault();
            this.submit();
        });

        // Курсор сразу в первом поле — иначе до него надо тянуться мышью.
        window.setTimeout(() => this.nameInput?.inputEl.focus(), 0);
    }

    /**
     * Список доступных подстановок. Кликом вставляется в шаблон — имена полей
     * держать в голове не нужно, а опечатка в имени видна только в заметке.
     */
    private renderFieldHints(container: HTMLElement): void {
        const box = container.createDiv({ cls: "mfl-hints" });
        const tokens = [
            "frontmatter",
            ...this.fields.map((field) => field.name),
            "cursor",
        ];

        for (const token of tokens) {
            const chip = box.createDiv({ cls: "mfl-hint", text: `{{${token}}}` });
            chip.addEventListener("click", () => this.insertToken(`{{${token}}}`));
        }
    }

    private insertToken(token: string): void {
        const input = this.templateInput;
        if (!input) return;

        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        input.value = input.value.slice(0, start) + token + input.value.slice(end);
        this.template = input.value;

        const caret = start + token.length;
        input.setSelectionRange(caret, caret);
        input.focus();
    }

    private renderIconPreview(): void {
        const box = this.iconPreview;
        if (!box) return;
        box.empty();
        setIcon(box, this.icon === "" ? DEFAULT_FORM_ICON : this.icon);
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

        // В режиме правки формат ни при чём: значения пишутся в шапку по
        // ключам, а не собираются в текст.
        if (this.command.mode !== "update") {
            new Setting(container)
                .setName("Формат результата")
                .setDesc("Запасной вид вывода. Используется, только если шаблон заметки пуст")
                .addDropdown((dropdown) => {
                    for (const [format, label] of Object.entries(OUTPUT_FORMAT_LABELS)) {
                        dropdown.addOption(format, label);
                    }
                    dropdown.setValue(this.command.format).onChange((value) => {
                        this.command.format = value as OutputFormat;
                    });
                });
        }

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
        const template = this.template.trim();
        const folder = this.folder.trim();
        const icon = this.icon.trim();

        this.options.onSubmit({
            name,
            title: title === "" ? name : title,
            folder: folder === "" ? undefined : folder,
            icon: icon === "" ? undefined : icon,
            command: this.command,
            template: template === "" ? undefined : this.template,
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
