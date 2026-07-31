import { AbstractInputSuggest, App } from "obsidian";
import type { SelectOption } from "../core/types";

/**
 * Подсказка по готовому списку вариантов. После выбора очищает поле —
 * значение уезжает в метки, а ввод остаётся свободным для следующего.
 */
export class ValueSuggest extends AbstractInputSuggest<SelectOption> {
    constructor(
        app: App,
        textInputEl: HTMLInputElement,
        /** Может считаться на месте: список из запроса Dataview заранее неизвестен. */
        private source: () => SelectOption[] | Promise<SelectOption[]>,
        onChoose: (value: string) => void,
    ) {
        super(app, textInputEl);

        this.onSelect((option) => {
            this.setValue("");
            onChoose(option.value);
            this.close();
        });
    }

    protected async getSuggestions(query: string): Promise<SelectOption[]> {
        const search = query.toLowerCase();
        const options = await this.source();
        return options.filter(
            (option) =>
                option.label.toLowerCase().includes(search) ||
                option.value.toLowerCase().includes(search),
        );
    }

    renderSuggestion(option: SelectOption, el: HTMLElement): void {
        el.setText(option.label);
    }
}
