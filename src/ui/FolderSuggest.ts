import { AbstractInputSuggest, App, TFolder } from "obsidian";

/**
 * Выпадающий список папок хранилища для текстового поля. Пустой запрос
 * показывает все папки — так поле работает как выбор из меню, а не только
 * как подсказка при наборе.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    constructor(app: App, textInputEl: HTMLInputElement, onChoose: (path: string) => void) {
        super(app, textInputEl);

        this.onSelect((folder) => {
            this.setValue(folder.path);
            onChoose(folder.path);
            this.close();
        });
    }

    protected getSuggestions(query: string): TFolder[] {
        const search = query.toLowerCase();
        return this.app.vault
            .getAllLoadedFiles()
            .filter((file): file is TFolder => file instanceof TFolder)
            .filter((folder) => folder.path.toLowerCase().includes(search))
            .sort((a, b) => a.path.localeCompare(b.path));
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        // У корня хранилища path равен "/", и это единственное осмысленное
        // представление — basename у него пустой.
        el.setText(folder.path);
    }
}
