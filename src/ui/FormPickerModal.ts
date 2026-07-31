import { App, FuzzySuggestModal } from "obsidian";
import { t } from "../i18n";
import type { FormDefinition } from "../core/types";

/**
 * Выбор формы для заполнения. Берём готовый FuzzySuggestModal, а не пишем
 * свой список: это тот же поиск с той же клавиатурой, что и в палитре команд,
 * и вести себя он обязан одинаково.
 */
export class FormPickerModal extends FuzzySuggestModal<FormDefinition> {
    constructor(
        app: App,
        private forms: FormDefinition[],
        private onPick: (form: FormDefinition) => void,
    ) {
        super(app);
        this.setPlaceholder(t("browser.pickForm"));
    }

    getItems(): FormDefinition[] {
        return this.forms;
    }

    /**
     * Папка идёт в строку поиска: форм с похожими заголовками бывает
     * несколько, и «Чтение / Книга» отличается от «Работа / Книга».
     */
    getItemText(form: FormDefinition): string {
        const folder = form.folder?.trim() ?? "";
        return folder === "" ? form.title : `${folder} / ${form.title}`;
    }

    onChooseItem(form: FormDefinition): void {
        this.onPick(form);
    }
}
