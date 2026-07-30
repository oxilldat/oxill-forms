import { App, Modal, Setting } from "obsidian";
import { formCodeFields, parseFormDefinition } from "../core/settings";
import type { FormDefinition } from "../core/types";

interface ImportFormOptions {
    /** Занято ли имя. Занятое имя не ошибка — форма приедет переименованной. */
    isNameTaken: (name: string) => boolean;
    /** Подбирает свободное имя, если предложенное занято. */
    freeName: (base: string) => string;
    onImport: (form: FormDefinition, renamedFrom?: string) => void;
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
        modalEl.addClass("mfl-wide-modal");
        contentEl.addClass("mfl-modal");
        contentEl.createEl("h3", { text: "Импорт формы", cls: "mfl-title" });

        new Setting(contentEl)
            .setClass("mfl-textarea")
            .setName("JSON формы")
            .setDesc("Вставьте то, что скопировали кнопкой экспорта")
            .addTextArea((area) => {
                area.inputEl.rows = 12;
                area.setPlaceholder('{ "name": "book", "title": "Книга", ... }').onChange(
                    (value) => {
                        this.text = value;
                        this.acknowledged = false;
                        this.clearMessages();
                    },
                );
                window.setTimeout(() => area.inputEl.focus(), 0);
            });

        this.warningEl = contentEl.createDiv();
        this.errorEl = contentEl.createDiv({ cls: "mfl-error" });

        new Setting(contentEl)
            .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
            .addButton((button) =>
                button
                    .setButtonText("Импортировать")
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

        if (this.text.trim() === "") return this.fail("Вставьте JSON формы");

        let raw: unknown;
        try {
            raw = JSON.parse(this.text);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return this.fail(`Это не похоже на JSON: ${reason}`);
        }

        const form = parseFormDefinition(raw);
        if (!form) {
            return this.fail("В JSON нет формы: нужны как минимум name, title и fields");
        }

        // Второе нажатие после показа кода означает согласие.
        const code = formCodeFields(form);
        if (code.length > 0 && !this.acknowledged) {
            this.acknowledged = true;
            this.showCodeWarning(code);
            return;
        }

        const taken = this.options.isNameTaken(form.name);
        const finalName = taken ? this.options.freeName(form.name) : form.name;

        this.close();
        this.options.onImport(
            { ...form, name: finalName },
            taken ? form.name : undefined,
        );
    }

    private showCodeWarning(code: { field: string; query: string }[]): void {
        const box = this.warningEl;
        if (!box) return;

        box.createDiv({
            cls: "mfl-warning",
            text:
                "В форме есть поля с запросами Dataview — это исполняемый код. " +
                "Прочитайте его и нажмите «Импортировать» ещё раз, если согласны.",
        });

        for (const item of code) {
            box.createDiv({ cls: "mfl-code-label", text: item.field });
            box.createEl("pre", { cls: "mfl-code", text: item.query });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
