import { App, Modal, Setting, setIcon } from "obsidian";
import { t } from "../i18n";

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
        modalEl.addClass("oxf-confirm-modal");
        contentEl.addClass("oxf-modal");

        const head = contentEl.createDiv({ cls: "oxf-confirm-head" });
        if (this.options.icon) {
            const icon = head.createDiv({ cls: "oxf-confirm-icon" });
            setIcon(icon, this.options.icon);
        }
        head.createEl("h3", { text: this.options.title, cls: "oxf-title" });

        contentEl.createDiv({ cls: "oxf-confirm-text", text: this.options.message });

        new Setting(contentEl)
            .addButton((button) =>
                button
                    .setButtonText(this.options.cancelText ?? t("common.cancel"))
                    .onClick(() => this.close()),
            )
            .addButton((button) => {
                button.setButtonText(this.options.confirmText ?? t("confirm.delete")).onClick(() => {
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
