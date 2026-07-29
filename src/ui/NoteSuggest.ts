import { AbstractInputSuggest, App, TFile } from "obsidian";

/**
 * Выбор заметки из заданной папки. Пустой запрос показывает все заметки папки,
 * поэтому поле работает и как список, и как поиск.
 */
export class NoteSuggest extends AbstractInputSuggest<TFile> {
    constructor(
        app: App,
        textInputEl: HTMLInputElement,
        private folder: string,
        onChoose: (basename: string) => void,
    ) {
        super(app, textInputEl);

        this.onSelect((file) => {
            this.setValue(file.basename);
            onChoose(file.basename);
            this.close();
        });
    }

    protected getSuggestions(query: string): TFile[] {
        const search = query.toLowerCase();
        const folder = this.folder.trim().replace(/\/$/, "");
        const prefix = folder === "" || folder === "/" ? "" : `${folder}/`;

        return this.app.vault
            .getMarkdownFiles()
            .filter((file) => file.path.startsWith(prefix))
            .filter((file) => file.basename.toLowerCase().includes(search))
            .sort((a, b) => a.basename.localeCompare(b.basename));
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.createDiv({ text: file.basename });
        el.createDiv({ cls: "mfl-suggest-path", text: file.path });
    }
}
