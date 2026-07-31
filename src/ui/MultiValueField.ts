import { App, setIcon } from "obsidian";
import type { SelectOption } from "../core/types";
import { ValueSuggest } from "./ValueSuggest";

/**
 * Источник вариантов. Список — когда он известен заранее; функция — когда
 * его нужно считать (запрос Dataview зависит от других полей формы и от
 * хранилища, поэтому спрашиваем его в момент показа подсказки).
 */
export type MultiValueSource = SelectOption[] | (() => Promise<SelectOption[]>);

interface MultiValueOptions {
    app: App;
    container: HTMLElement;
    initial: string[];
    /** Все возможные варианты. Уже выбранные отфильтруются сами. */
    candidates: MultiValueSource;
    /** Разрешить значения, которых нет в списке. Нужно тегам. */
    allowNew: boolean;
    onChange: (values: string[]) => void;
}

/**
 * Поле с несколькими значениями: выбранное показывается метками, ввод снизу
 * добавляет новые значения с подсказкой. Один виджет обслуживает и
 * множественный выбор, и теги — разница лишь в том, можно ли вводить своё.
 */
export class MultiValueField {
    private values: string[];
    private chipsEl: HTMLElement;
    /**
     * Последний известный список вариантов. У вычисляемого источника он
     * нужен для двух вещей: подписи на метке и проверки «такое значение
     * вообще есть» — обе случаются между показами подсказки.
     */
    private known: SelectOption[];

    constructor(private options: MultiValueOptions) {
        this.values = [...options.initial];
        this.known = Array.isArray(options.candidates) ? options.candidates : [];

        const root = options.container.createDiv({ cls: "mfl-multi" });
        this.chipsEl = root.createDiv({ cls: "mfl-chips" });

        const input = root.createEl("input", { type: "text", cls: "mfl-multi-input" });
        input.placeholder = options.allowNew ? "Добавить или выбрать" : "Выбрать";

        new ValueSuggest(options.app, input, () => this.available(), (value) => this.add(value));

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                // Форму отправлять нельзя: Enter здесь добавляет значение.
                event.preventDefault();
                event.stopPropagation();
                if (options.allowNew) {
                    this.add(input.value);
                    input.value = "";
                }
                return;
            }
            // Backspace в пустом поле убирает последнюю метку — привычный жест.
            if (event.key === "Backspace" && input.value === "" && this.values.length > 0) {
                event.preventDefault();
                const last = this.values[this.values.length - 1];
                if (last !== undefined) this.remove(last);
            }
        });

        this.renderChips();
    }

    private async available(): Promise<SelectOption[]> {
        const source = this.options.candidates;
        this.known = Array.isArray(source) ? source : await source();
        return this.known.filter((option) => !this.values.includes(option.value));
    }

    private labelFor(value: string): string {
        return this.known.find((option) => option.value === value)?.label ?? value;
    }

    private add(raw: string): void {
        const value = raw.trim();
        if (value === "" || this.values.includes(value)) return;

        const known = this.known.some((option) => option.value === value);
        if (!known && !this.options.allowNew) return;

        this.values.push(value);
        this.commit();
    }

    private remove(value: string): void {
        this.values = this.values.filter((item) => item !== value);
        this.commit();
    }

    private commit(): void {
        this.renderChips();
        this.options.onChange([...this.values]);
    }

    private renderChips(): void {
        this.chipsEl.empty();
        for (const value of this.values) {
            const chip = this.chipsEl.createDiv({ cls: "mfl-chip" });
            chip.createSpan({ text: this.labelFor(value) });

            const remove = chip.createDiv({
                cls: "mfl-chip-remove",
                attr: { "aria-label": "Убрать" },
            });
            setIcon(remove, "x");
            remove.addEventListener("click", () => this.remove(value));
        }
    }
}
