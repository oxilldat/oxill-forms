import { stringifyYaml } from "obsidian";
import { applyTransform, isTransformName } from "./transform";

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
 * Значение одной строкой. Массивы склеиваем запятой — так их понимает
 * Dataview в inline-свойствах и так их привычно видеть в тексте.
 */
function flatten(value: FieldValue): string {
    return Array.isArray(value) ? value.join(", ") : String(value);
}

/**
 * Результат заполнения формы. Возвращается из `openForm` и умеет отдавать
 * данные в форматах, которые чаще всего нужны в заметке.
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
        return this.select(selection);
    }

    /** Отбор полей для вывода. Без настроек возвращает всё. */
    private select(selection?: FieldSelection): FormData {
        let entries = Object.entries(this.data);
        if (selection?.pick) {
            const pick = selection.pick;
            entries = entries.filter(([key]) => pick.includes(key));
        }
        if (selection?.omit) {
            const omit = selection.omit;
            entries = entries.filter(([key]) => !omit.includes(key));
        }
        return Object.fromEntries(entries);
    }

    /** Значение одного поля. Для незаполненных возвращает `fallback`. */
    get(key: string, fallback: FieldValue = ""): FieldValue {
        return this.data[key] ?? fallback;
    }

    /**
     * Данные как блок YAML — то, что кладут между `---` в шапке заметки.
     * Ограничители не добавляем: их ставит вызывающий код. Массивы выходят
     * списком, и Obsidian понимает их как множественное свойство.
     *
     * Служебные поля убираются так: `asFrontmatter({ omit: ["target"] })`.
     */
    asFrontmatter(selection?: FieldSelection): string {
        const data = this.select(selection);
        if (Object.keys(data).length === 0) return "";
        return stringifyYaml(data).trimEnd();
    }

    /** Данные как inline-свойства Dataview: `ключ:: значение`. */
    asDataview(selection?: FieldSelection): string {
        return Object.entries(this.select(selection))
            .map(([key, value]) => `${key}:: ${flatten(value)}`)
            .join("\n");
    }

    /** Данные как маркированный список. */
    asList(selection?: FieldSelection): string {
        return Object.entries(this.select(selection))
            .map(([key, value]) => `- ${key}: ${flatten(value)}`)
            .join("\n");
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
     * Подстановка в шаблон: `{{ ключ }}` или `{{ ключ | преобразование }}`.
     * Доступны upper, lower, trim, capitalize, slug, snake, link и list.
     *
     * Неизвестный ключ или неизвестное преобразование оставляют шаблон нетронутым —
     * так опечатка сразу видна в тексте, а не превращается в пустое место.
     */
    asString(template: string): string {
        return template.replace(
            /\{\{\s*(\w+)\s*(?:\|\s*(\w+)\s*)?\}\}/g,
            (match, key: string, transform?: string) => {
                const value = this.data[key];
                if (value === undefined) return match;
                if (transform === undefined) return flatten(value);
                if (!isTransformName(transform)) return match;
                return applyTransform(transform, value);
            },
        );
    }

    toString(): string {
        return this.asFrontmatter();
    }
}
