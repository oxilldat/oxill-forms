import { stringifyYaml } from "obsidian";
import { asDataviewText, asListText, renderTemplate, selectFields } from "./format";
import { applyTransform } from "./transform";

export type FieldValue = string | number | boolean | string[];
export type FormData = Record<string, FieldValue>;

export type FormStatus = "ok" | "cancelled";

/**
 * Какие поля попадут в вывод. Набор полей формы и набор полей заметки не
 * совпадают: служебные поля вроде «куда сохранить» нужны для работы, но в
 * тексте заметки им не место.
 */
export interface FieldSelection {
    /** Оставить только эти поля. */
    pick?: string[];
    /** Выбросить эти поля. Применяется после pick. */
    omit?: string[];
}

/**
 * Результат заполнения формы. Тонкая обёртка: вся сборка текста живёт в
 * format.ts, здесь только доступ к данным и YAML, которому нужен Obsidian.
 */
export class FormResult {
    constructor(
        private readonly data: FormData,
        readonly status: FormStatus,
    ) {}

    /** Форму отправили, а не закрыли. Проверять стоит всегда. */
    get ok(): boolean {
        return this.status === "ok";
    }

    /** Копия собранных данных. Без аргумента — всё, что собрала форма. */
    getData(selection?: FieldSelection): FormData {
        return selectFields(this.data, selection);
    }

    /** Значение одного поля. Для незаполненных возвращает `fallback`. */
    get(key: string, fallback: FieldValue = ""): FieldValue {
        return this.data[key] ?? fallback;
    }

    /**
     * Ссылка на значение: `[[Мария Сидорова]]`. Для полей типа «заметка» и
     * «выбор из заметок» это то, что нужно в заметке почти всегда.
     */
    link(key: string): string {
        const value = this.data[key];
        return value === undefined ? "" : applyTransform("link", value);
    }

    /**
     * Данные как блок YAML — то, что кладут между `---` в шапке заметки.
     * Ограничители не добавляем: их ставит вызывающий код. Массивы выходят
     * списком, и Obsidian понимает их как множественное свойство.
     *
     * Служебные поля убираются так: `asFrontmatter({ omit: ["target"] })`.
     */
    asFrontmatter(selection?: FieldSelection): string {
        const data = selectFields(this.data, selection);
        if (Object.keys(data).length === 0) return "";
        return stringifyYaml(data).trimEnd();
    }

    /** Данные как inline-свойства Dataview: `ключ:: значение`. */
    asDataview(selection?: FieldSelection): string {
        return asDataviewText(selectFields(this.data, selection));
    }

    /** Данные как маркированный список. */
    asList(selection?: FieldSelection): string {
        return asListText(selectFields(this.data, selection));
    }

    /**
     * Подстановка в шаблон: `{{ ключ }}` или `{{ ключ | преобразование }}`.
     * Доступны upper, lower, trim, capitalize, slug, snake, link и list.
     */
    asString(template: string, selection?: FieldSelection): string {
        return renderTemplate(template, selectFields(this.data, selection));
    }

    toString(): string {
        return this.asFrontmatter();
    }
}
