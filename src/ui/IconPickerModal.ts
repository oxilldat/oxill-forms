import { App, getIconIds, Modal, setIcon, Setting } from "obsidian";
import { DEFAULT_FORM_ICON } from "../core/formFolders";

/** Сколько значков рисуем за раз. Их больше тысячи, все сразу — заметная пауза. */
const PAGE_SIZE = 240;

interface IconPickerOptions {
    current: string;
    onPick: (icon: string) => void;
}

/**
 * Выбор значка сеткой с поиском. Сделано окном, а не всплывашкой у кнопки:
 * окно настроек удерживает фокус внутри себя, и всплывашке пришлось бы
 * бороться и за фокус, и за позиционирование среди чужой разметки.
 */
export class IconPickerModal extends Modal {
    private gridEl: HTMLElement | null = null;
    private noteEl: HTMLElement | null = null;
    private readonly icons: string[];

    constructor(
        app: App,
        private options: IconPickerOptions,
    ) {
        super(app);
        // Идентификаторы приходят с префиксом «lucide-», в setIcon он не нужен.
        const ids = getIconIds().map((id) => id.replace(/^lucide-/, ""));
        this.icons = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        modalEl.addClass("mfl-icon-modal");
        contentEl.addClass("mfl-modal");
        contentEl.createEl("h3", { text: "Значок формы", cls: "mfl-title" });

        new Setting(contentEl).addSearch((search) => {
            search.setPlaceholder("Поиск значка");
            search.onChange((value) => this.renderGrid(value));
            window.setTimeout(() => search.inputEl.focus(), 0);
        });

        this.gridEl = contentEl.createDiv({ cls: "mfl-icon-grid" });
        this.noteEl = contentEl.createDiv({ cls: "mfl-icon-note" });
        this.renderGrid("");
    }

    private renderGrid(query: string): void {
        const grid = this.gridEl;
        if (!grid) return;
        grid.empty();

        const search = query.trim().toLowerCase();
        const found = search === "" ? this.icons : this.icons.filter((id) => id.includes(search));

        for (const icon of found.slice(0, PAGE_SIZE)) {
            const cell = grid.createDiv({ cls: "mfl-icon-cell", attr: { "aria-label": icon } });
            if (icon === this.options.current) cell.addClass("is-active");
            setIcon(cell, icon);
            cell.addEventListener("click", () => {
                this.close();
                this.options.onPick(icon);
            });
        }

        if (!this.noteEl) return;
        if (found.length === 0) {
            this.noteEl.setText("Ничего не нашлось");
        } else if (found.length > PAGE_SIZE) {
            this.noteEl.setText(
                `Показано ${PAGE_SIZE} из ${found.length}. Уточните поиск, чтобы увидеть остальные`,
            );
        } else {
            this.noteEl.setText(`Найдено: ${found.length}`);
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

/** Значок, который показывается, когда свой не выбран. */
export { DEFAULT_FORM_ICON };
