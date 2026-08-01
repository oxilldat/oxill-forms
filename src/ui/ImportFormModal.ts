import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";
import { isNewerVersion, parseBundle } from "../core/exchange";
import { formCodeFields } from "../core/settings";
import type { FormDefinition } from "../core/types";

interface ImportFormOptions {
    /** Версия установленного плагина — сравнивается с версией из конверта. */
    pluginVersion: string;
    /** Занято ли имя. Занятое имя не ошибка — форма приедет переименованной. */
    isNameTaken: (name: string) => boolean;
    /** Подбирает свободное имя, если предложенное занято. */
    freeName: (base: string) => string;
    onImport: (forms: FormDefinition[], renamed: string[]) => void | Promise<void>;
}

/**
 * Импорт формы из JSON. Две стадии: разбор и, если в форме есть поля с
 * запросами Dataview, показ этого кода перед добавлением. Импортировать
 * форму со стороны — то же, что запустить чужой скрипт, и знать об этом
 * пользователь должен до, а не после.
 */
export class ImportFormModal extends Modal {
    private text = "";
    private acknowledged = false;
    private errorEl: HTMLElement | null = null;
    private warningEl: HTMLElement | null = null;

    constructor(
        app: App,
        private options: ImportFormOptions,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        modalEl.addClass("oxf-wide-modal");
        contentEl.addClass("oxf-modal");
        contentEl.createEl("h3", { text: t("import.title"), cls: "oxf-title" });

        new Setting(contentEl)
            .setClass("oxf-textarea")
            .setName(t("import.json"))
            .setDesc(t("import.jsonDesc"))
            .addTextArea((area) => {
                area.inputEl.rows = 12;
                area.setPlaceholder('{ "name": "book", "title": "Book", ... }').onChange(
                    (value) => {
                        this.text = value;
                        this.acknowledged = false;
                        this.clearMessages();
                    },
                );
                window.setTimeout(() => area.inputEl.focus(), 0);
            });

        this.warningEl = contentEl.createDiv();
        this.errorEl = contentEl.createDiv({ cls: "oxf-error" });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText(t("common.cancel")).onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText(t("import.button"))
                    .setCta()
                    .onClick(() => this.submit()),
            );
    }

    private clearMessages(): void {
        this.errorEl?.setText("");
        this.warningEl?.empty();
    }

    private fail(message: string): void {
        this.errorEl?.setText(message);
    }

    private submit(): void {
        this.clearMessages();

        if (this.text.trim() === "") return this.fail(t("import.empty"));

        let raw: unknown;
        try {
            raw = JSON.parse(this.text);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return this.fail(t("import.notJson", { reason }));
        }

        const bundle = parseBundle(raw);
        if (!bundle) {
            return this.fail(t("import.noForm"));
        }

        // Второе нажатие после показа кода и предупреждений означает согласие.
        const code = bundle.forms.flatMap(formCodeFields);
        const fromNewer =
            bundle.version !== undefined &&
            isNewerVersion(bundle.version, this.options.pluginVersion);

        if ((code.length > 0 || fromNewer) && !this.acknowledged) {
            this.acknowledged = true;
            if (fromNewer && bundle.version) this.showVersionWarning(bundle.version);
            if (code.length > 0) this.showCodeWarning(code);
            return;
        }

        // Имена подбираем по очереди: две импортируемые формы могут спорить
        // не только с существующими, но и между собой.
        const taken = new Set<string>();
        const renamed: string[] = [];
        const forms = bundle.forms.map((form) => {
            const busy = this.options.isNameTaken(form.name) || taken.has(form.name);
            const name = busy ? this.options.freeName(form.name) : form.name;
            if (busy) renamed.push(form.name);
            taken.add(name);
            return { ...form, name };
        });

        this.close();
        void this.options.onImport(forms, renamed);
    }

    private showVersionWarning(version: string): void {
        this.warningEl?.createDiv({
            cls: "oxf-warning",
            text: t("import.versionWarn", { version, current: this.options.pluginVersion }),
        });
    }

    private showCodeWarning(code: { field: string; query: string }[]): void {
        const box = this.warningEl;
        if (!box) return;

        box.createDiv({
            cls: "oxf-warning",
            text: t("import.codeWarn"),
        });

        for (const item of code) {
            box.createDiv({ cls: "oxf-code-label", text: item.field });
            box.createEl("pre", { cls: "oxf-code", text: item.query });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
