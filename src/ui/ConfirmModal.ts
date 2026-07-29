import { App, Modal, Setting } from "obsidian";

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    /** Красная кнопка для необратимых действий. */
    danger?: boolean;
    onConfirm: () => void;
}

/**
 * У Obsidian нет встроенного окна подтверждения, а удалять форму одним
 * кликом без вопроса — плохая идея.
 */
export class ConfirmModal extends Modal {
    constructor(
        app: App,
        private options: ConfirmOptions,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass("mfl-modal");
        contentEl.createEl("h3", { text: this.options.title, cls: "mfl-title" });
        contentEl.createEl("p", { text: this.options.message });

        new Setting(contentEl)
            .addButton((button) =>
                button.setButtonText("Отмена").onClick(() => this.close()),
            )
            .addButton((button) => {
                button
                    .setButtonText(this.options.confirmText ?? "Удалить")
                    .onClick(() => {
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
