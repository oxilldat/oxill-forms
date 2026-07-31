import { getIconIds, setIcon } from "obsidian";

/** Сколько значков рисуем за раз. Их больше тысячи, все сразу — заметная пауза. */
const PAGE_SIZE = 240;

/**
 * Список значков собираем один раз: их больше тысячи, и перебирать их на
 * каждое нажатие клавиши в поиске было бы заметно.
 */
let iconCache: string[] | null = null;
function allIcons(): string[] {
    if (!iconCache) {
        // Идентификаторы приходят с префиксом «lucide-», в setIcon он не нужен.
        const ids = getIconIds().map((id) => id.replace(/^lucide-/, ""));
        iconCache = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
    }
    return iconCache;
}

/**
 * Выбор значка сеткой с поиском — компактной всплывашкой под кнопкой, а не
 * отдельным окном. Всплывашка кладётся внутрь окна-хозяина: окно настроек и
 * модалка удерживают фокус внутри себя, и лежащее снаружи поле поиска нельзя
 * было бы выбрать. Позицию плагин пересчитывает сам, поэтому вложенность в
 * чужую разметку ей не мешает.
 */
export class IconPicker {
    private pop: HTMLElement | null = null;
    private grid: HTMLElement | null = null;
    private note: HTMLElement | null = null;
    private onDocDown: ((ev: MouseEvent) => void) | null = null;
    private onKey: ((ev: KeyboardEvent) => void) | null = null;
    private onScroll: ((ev: Event) => void) | null = null;

    constructor(
        private anchorEl: HTMLElement,
        private current: string,
        private onPick: (icon: string) => void,
        /** Зовётся при любом закрытии, включая клик мимо и Escape. */
        private onClose?: () => void,
    ) {}

    isOpen(): boolean {
        return this.pop !== null;
    }

    open(): void {
        // Вешаем как можно глубже — внутрь области, где хозяин разрешает фокус.
        // Порядок от внутреннего к внешнему; откат к body, если ничего рядом нет.
        const host =
            this.anchorEl.closest(".modal-content") ??
            this.anchorEl.closest(".modal") ??
            this.anchorEl.closest(".vertical-tab-content") ??
            document.body;

        this.pop = host.createDiv({ cls: "mfl-icon-pop" });

        const search = this.pop.createEl("input", {
            cls: "mfl-icon-search",
            attr: { type: "text", placeholder: "Поиск значка" },
        });
        this.grid = this.pop.createDiv({ cls: "mfl-icon-grid" });
        this.note = this.pop.createDiv({ cls: "mfl-icon-note" });

        this.renderGrid("");
        this.place();

        search.addEventListener("input", () => this.renderGrid(search.value));
        // Нажатия внутри всплывашки наружу не выпускаем: снаружи их слышит
        // хозяин (окно настроек или модалка) и реагирует по-своему.
        this.pop.addEventListener("mousedown", (ev) => ev.stopPropagation());

        this.onDocDown = (ev) => {
            if (!this.pop) return;
            const target = ev.target as Node;
            if (!this.pop.contains(target) && target !== this.anchorEl) this.close();
        };
        this.onKey = (ev) => {
            if (ev.key === "Escape") this.close();
        };
        // Прокрутка закрывает — всплывашка приколота к координатам кнопки и
        // уехала бы от неё. Но прокрутка ВНУТРИ самой сетки значков не в счёт:
        // иначе список нельзя пролистать, он закрывается от первого же движения.
        this.onScroll = (ev) => {
            if (!this.pop) return;
            if (!this.pop.contains(ev.target as Node)) this.close();
        };

        // Фокус ставим отложенным шагом: клик, которым всплывашку открыли, ещё
        // не отработал до конца и успел бы перевести фокус обратно на кнопку.
        window.setTimeout(() => {
            if (!this.pop) return;
            search.focus();
            search.select();
            document.addEventListener("mousedown", this.onDocDown!);
            document.addEventListener("keydown", this.onKey!);
            window.addEventListener("scroll", this.onScroll!, true);
        }, 0);
    }

    /**
     * Позиционирование с самопроверкой. Всплывашка лежит внутри чужой разметки,
     * а там у родителей могут быть преобразования — тогда координаты fixed
     * отсчитываются не от окна, и попасть в нужное место вслепую нельзя.
     * Поэтому ставим нулевую точку, смотрим, куда она попала, и сдвигаем на
     * разницу. Работает при любом раскладе родителей.
     */
    private place(): void {
        if (!this.pop) return;
        this.pop.style.left = "0px";
        this.pop.style.top = "0px";
        const zero = this.pop.getBoundingClientRect();

        const r = this.anchorEl.getBoundingClientRect();
        const w = this.pop.offsetWidth;
        const h = this.pop.offsetHeight;

        // Не даём вылезти за края окна: вправо ограничиваем, а вверх
        // разворачиваем, если снизу не помещается.
        const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
        const top =
            r.bottom + h + 8 > window.innerHeight
                ? Math.max(8, r.top - h - 6)
                : r.bottom + 6;

        this.pop.style.left = `${left - zero.left}px`;
        this.pop.style.top = `${top - zero.top}px`;
    }

    private renderGrid(query: string): void {
        const grid = this.grid;
        if (!grid) return;
        grid.empty();

        const q = query.trim().toLowerCase();
        const all = allIcons();
        const found = q === "" ? all : all.filter((id) => id.includes(q));
        const shown = found.slice(0, PAGE_SIZE);

        for (const id of shown) {
            const cell = grid.createDiv({
                cls: "mfl-icon-cell",
                attr: { "aria-label": id, role: "button", tabindex: "0" },
            });
            if (id === this.current) cell.addClass("is-active");
            setIcon(cell, id);

            const choose = (ev: Event) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.onPick(id);
                this.close();
            };

            cell.addEventListener("click", choose);
            // Ячейка объявлена кнопкой и получает фокус табом — значит обязана
            // срабатывать с клавиатуры, иначе роль обещает то, чего нет.
            cell.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" || ev.key === " ") choose(ev);
            });
        }

        if (!this.note) return;
        if (found.length === 0) {
            this.note.setText("Ничего не нашлось");
        } else if (found.length > shown.length) {
            this.note.setText(`Показано ${shown.length} из ${found.length}. Уточните поиск`);
        } else {
            this.note.setText(`Найдено: ${found.length}`);
        }
    }

    close(): void {
        if (!this.pop) return;

        if (this.onDocDown) document.removeEventListener("mousedown", this.onDocDown);
        if (this.onKey) document.removeEventListener("keydown", this.onKey);
        if (this.onScroll) window.removeEventListener("scroll", this.onScroll, true);
        this.onDocDown = null;
        this.onKey = null;
        this.onScroll = null;

        this.pop.remove();
        this.pop = null;
        this.onClose?.();
    }
}
