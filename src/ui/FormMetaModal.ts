import { App, Modal, Setting, setIcon, TextComponent } from "obsidian";
import { DEFAULT_FORM_ICON } from "../core/formFolders";
import { t } from "../i18n";
import { isValidName } from "../core/naming";
import {
    commandModeLabel,
    COMMAND_MODE_ORDER,
    openModeLabel,
    OPEN_MODE_ORDER,
    outputFormatLabel,
    OUTPUT_FORMAT_ORDER,
} from "../core/labels";
import type {
    CommandMode,
    FieldDefinition,
    FormCommand,
    FormDefinition,
    OpenMode,
    OutputFormat,
} from "../core/types";
import { FolderSuggest } from "./FolderSuggest";
import { IconPicker } from "./IconPicker";
import { restrictToLatin } from "./restrictToLatin";
import { settingsGroup } from "./settingsGroup";
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
    onSubmit: (meta: FormMeta) => void | Promise<void>;
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
    /** Открытая всплывашка значков. Её надо закрыть вместе с окном. */
    private iconPicker: IconPicker | null = null;
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
        const { contentEl, modalEl } = this;
        modalEl.addClass("oxf-meta-modal");
        contentEl.addClass("oxf-modal");
        contentEl.createEl("h3", {
            text: this.isEditing ? t("meta.editTitle") : t("meta.newTitle"),
            cls: "oxf-title",
        });

        // Длинные пояснения живут у заголовка группы: там им доступна вся
        // ширина окна. В строке они делили бы её пополам с полем ввода и
        // жались бы в узкую колонку.
        const main = settingsGroup(
            contentEl,
            t("meta.mainGroup"),
            t("meta.mainGroupDesc"),
        );

        new Setting(main)
            .setName(t("meta.name"))
            .setDesc(t("meta.nameDesc"))
            .addText((text) => {
                this.nameInput = text;
                text.setPlaceholder("A - z").setValue(this.name);
                restrictToLatin(text.inputEl, (value) => {
                    this.name = value;
                    this.clearError();
                });
            });

        new Setting(main)
            .setName(t("meta.title"))
            .addText((text) =>
                text
                    .setPlaceholder(t("meta.titlePlaceholder"))
                    .setValue(this.title)
                    .onChange((value) => {
                        this.title = value;
                        this.clearError();
                    }),
            );

        const look = settingsGroup(
            contentEl,
            t("meta.lookGroup"),
            t("meta.lookGroupDesc"),
        );

        new Setting(look)
            .setName(t("meta.folder"))
            .setDesc(t("meta.folderDesc"))
            .addText((text) => {
                text.setPlaceholder(t("meta.folderPlaceholder"))
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

        // Значок выбирается сеткой, а не набором имени: помнить, что нужный
        // называется «clipboard-list», нельзя, а список их больше тысячи.
        new Setting(look).setName(t("meta.icon")).addButton((button) => {
            this.iconPreview = button.buttonEl;
            button.setTooltip(t("meta.pickIcon"));
            this.renderIconPreview();

            // Кнопка работает переключателем. Клик по ней всплывашку не
            // закрывает — иначе она бы схлопнулась и тут же открылась снова,
            // поэтому решение принимаем здесь, по сохранённой ссылке.
            button.onClick(() => {
                if (this.iconPicker?.isOpen()) {
                    this.iconPicker.close();
                    return;
                }

                this.iconPicker = new IconPicker(
                    button.buttonEl,
                    this.icon === "" ? DEFAULT_FORM_ICON : this.icon,
                    (icon) => {
                        this.icon = icon;
                        this.renderIconPreview();
                    },
                    () => {
                        this.iconPicker = null;
                    },
                );
                this.iconPicker.open();
            });
        });

        const commandGroup = settingsGroup(
            contentEl,
            t("meta.commandGroup"),
            t("meta.commandGroupDesc"),
        );

        new Setting(commandGroup)
            .setName(t("meta.addCommand"))
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

        const templateGroup = settingsGroup(
            contentEl,
            t("meta.templateGroup"),
            t("meta.templateGroupDesc"),

        );

        this.renderFieldHints(templateGroup);

        // Не Setting: у строки настроек левая половина отведена под подпись,
        // а подписи здесь нет — поле ютилось бы справа при пустом левом столбце.
        const area = templateGroup.createEl("textarea", { cls: "oxf-template-input" });
        area.rows = 10;
        area.placeholder = "---\n{{frontmatter}}\n---\n\n# {{ title }}\n";
        area.value = this.template;
        area.addEventListener("input", () => {
            this.template = area.value;
        });
        this.templateInput = area;

        this.errorEl = contentEl.createDiv({ cls: "oxf-error" });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText(t("common.cancel")).onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText(this.isEditing ? t("common.save") : t("common.create"))
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
        const box = container.createDiv({ cls: "oxf-hints" });
        const tokens = [
            "frontmatter",
            ...this.fields.map((field) => field.name),
            "cursor",
        ];

        for (const token of tokens) {
            const chip = box.createDiv({ cls: "oxf-hint", text: `{{${token}}}` });
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

    /** Кнопка показывает выбранный значок и его имя. */
    private renderIconPreview(): void {
        const button = this.iconPreview;
        if (!button) return;
        button.empty();
        button.addClass("oxf-icon-button");

        const icon = this.icon === "" ? DEFAULT_FORM_ICON : this.icon;
        setIcon(button.createSpan({ cls: "oxf-icon-badge" }), icon);
        button.createSpan({ text: icon });
    }

    private renderCommand(): void {
        const container = this.commandEl;
        if (!container) return;
        container.empty();
        if (!this.command.enabled) return;

        new Setting(container).setName(t("meta.commandMode")).addDropdown((dropdown) => {
            for (const mode of COMMAND_MODE_ORDER) {
                dropdown.addOption(mode, commandModeLabel(mode));
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
                .setName(t("meta.format"))
                .setDesc(t("meta.formatDesc"))
                .addDropdown((dropdown) => {
                    for (const format of OUTPUT_FORMAT_ORDER) {
                        dropdown.addOption(format, outputFormatLabel(format));
                    }
                    dropdown.setValue(this.command.format).onChange((value) => {
                        this.command.format = value as OutputFormat;
                    });
                });
        }

        if (this.command.mode !== "create") return;

        new Setting(container)
            .setName(t("meta.noteFolder"))
            .setDesc(t("meta.noteFolderDesc"))
            .addText((text) => {
                text.setPlaceholder(t("settings.folderPlaceholder"))
                    .setValue(this.command.folder ?? "")
                    .onChange((value) => {
                        if (value.trim() === "") delete this.command.folder;
                        else this.command.folder = value.trim();
                    });
                new FolderSuggest(this.app, text.inputEl, (path) => {
                    this.command.folder = path;
                });
            });

        new Setting(container)
            .setName(t("meta.noteName"))
            .setDesc(
                t("meta.noteNameDesc"),

            )
            .addText((text) =>
                text
                    .setPlaceholder(this.title.trim() === "" ? t("meta.formTitle") : this.title)
                    .setValue(this.command.nameTemplate ?? "")
                    .onChange((value) => {
                        if (value.trim() === "") delete this.command.nameTemplate;
                        else this.command.nameTemplate = value.trim();
                    }),
            );

        new Setting(container)
            .setName(t("meta.openIn"))
            .setDesc(t("meta.openInDesc"))
            .addDropdown((dropdown) => {
                for (const mode of OPEN_MODE_ORDER) {
                    dropdown.addOption(mode, openModeLabel(mode));
                }
                dropdown.setValue(this.command.openIn ?? "current").onChange((value) => {
                    this.command.openIn = value as OpenMode;
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

        if (name === "") return this.fail(t("meta.nameEmpty"));
        if (!isValidName(name)) {
            return this.fail(t("meta.nameLatin"));
        }
        if (this.options.isNameTaken(name)) return this.fail(t("meta.nameTaken", { name }));

        this.close();
        // Пустой заголовок — не ошибка: подставляем идентификатор.
        const template = this.template.trim();
        const folder = this.folder.trim();
        const icon = this.icon.trim();

        void this.options.onSubmit({
            name,
            title: title === "" ? name : title,
            folder: folder === "" ? undefined : folder,
            icon: icon === "" ? undefined : icon,
            command: this.command,
            template: template === "" ? undefined : this.template,
        });
    }

    onClose(): void {
        // Всплывашка живёт внутри разметки окна и исчезнет вместе с ней, но
        // её обработчики висят на document — снять их можно только отсюда.
        this.iconPicker?.close();
        this.contentEl.empty();
    }
}
