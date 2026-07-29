import { App, Modal, Setting, setIcon } from "obsidian";

interface ConfirmOptions {
    title: string;
    message: string;
    /** Иконка Lucide в шапке. Без неё окно выглядит как обычный вопрос. */
    icon?: string;
    confirmText?: string;
    cancelText?: string;
    /** Красная кнопка для необратимых действий. */
    danger?: boolean;
    onConfirm: () => void;
}

/**
 * У Obsidian нет встроенного окна подтверждения, а необратимые действия —
 * удаление формы, закрытие редактора с несохранёнными правками — просить
 * подтверждения обязаны.
 */
export class ConfirmModal extends Modal {
    constructor(
        app: App,
        private options: ConfirmOptions,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        modalEl.addClass("mfl-confirm-modal");
        contentEl.addClass("mfl-modal");

        const head = contentEl.createDiv({ cls: "mfl-confirm-head" });
        if (this.options.icon) {
            const icon = head.createDiv({ cls: "mfl-confirm-icon" });
            setIcon(icon, this.options.icon);
        }
        head.createEl("h3", { text: this.options.title, cls: "mfl-title" });

        contentEl.createDiv({ cls: "mfl-confirm-text", text: this.options.message });

        new Setting(contentEl)
            .addButton((button) =>
                button
                    .setButtonText(this.options.cancelText ?? "Отмена")
                    .onClick(() => this.close()),
            )
            .addButton((button) => {
                button.setButtonText(this.options.confirmText ?? "Удалить").onClick(() => {
                    this.close();
                    this.options.onConfirm();
                });
                if (this.options.danger) button.setWarning();
                return button;
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
