import { AbstractInputSuggest, App } from "obsidian";
import { DataviewError, runDataviewQuery } from "../core/dataview";
import type { FormData } from "../core/FormResult";

interface DataviewSuggestOptions {
    query: string;
    /** Имя своего поля — его значение из формы исключаем, см. ниже. */
    fieldName: string;
    getForm: () => FormData;
    onChoose: (value: string) => void;
    onError: (message: string) => void;
}

/**
 * Подсказка по результату запроса Dataview. Результат кешируется и
 * пересчитывается только когда меняются *другие* поля формы — иначе запрос
 * выполнялся бы на каждое нажатие клавиши в своём же поле.
 */
export class DataviewSuggest extends AbstractInputSuggest<string> {
    private cache: { signature: string; values: string[] } | null = null;

    constructor(
        app: App,
        textInputEl: HTMLInputElement,
        private options: DataviewSuggestOptions,
    ) {
        super(app, textInputEl);

        this.onSelect((value) => {
            this.setValue(value);
            options.onChoose(value);
            this.close();
        });
    }

    /** Значения формы без своего поля — от него список зависеть не должен. */
    private context(): FormData {
        const form = { ...this.options.getForm() };
        delete form[this.options.fieldName];
        return form;
    }

    protected async getSuggestions(query: string): Promise<string[]> {
        const context = this.context();
        const signature = JSON.stringify(context);

        if (this.cache === null || this.cache.signature !== signature) {
            try {
                const values = await runDataviewQuery(this.app, this.options.query, context);
                this.cache = { signature, values };
            } catch (error) {
                const message =
                    error instanceof DataviewError ? error.message : "Не удалось выполнить запрос";
                this.options.onError(message);
                this.cache = { signature, values: [] };
            }
        }

        const search = query.toLowerCase();
        return this.cache.values.filter((value) => value.toLowerCase().includes(search));
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.setText(value);
    }
}
