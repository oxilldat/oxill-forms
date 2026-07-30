import { AbstractInputSuggest, App, getIconIds, setIcon } from "obsidian";

/**
 * Подсказка по иконкам Obsidian. Список берём у приложения, а не держим
 * свой: иконки приезжают с обновлениями, и захардкоженный перечень устарел
 * бы в первый же месяц.
 */
export class IconSuggest extends AbstractInputSuggest<string> {
    constructor(app: App, textInputEl: HTMLInputElement, onChoose: (icon: string) => void) {
        super(app, textInputEl);

        this.onSelect((icon) => {
            this.setValue(icon);
            onChoose(icon);
            this.close();
        });
    }

    protected getSuggestions(query: string): string[] {
        const search = query.trim().toLowerCase();
        // Идентификаторы приходят с префиксом вида «lucide-», он в setIcon
        // не нужен и только мешает читать список.
        const ids = getIconIds().map((id) => id.replace(/^lucide-/, ""));
        const unique = [...new Set(ids)].sort((a, b) => a.localeCompare(b));

        if (search === "") return unique.slice(0, 50);
        return unique.filter((id) => id.includes(search));
    }

    renderSuggestion(icon: string, el: HTMLElement): void {
        el.addClass("mfl-icon-option");
        const box = el.createDiv({ cls: "mfl-icon-preview" });
        setIcon(box, icon);
        el.createSpan({ text: icon });
    }
}
