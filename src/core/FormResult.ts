import { stringifyYaml } from "obsidian";

export type FieldValue = string | number | boolean;
export type FormData = Record<string, FieldValue>;

export type FormStatus = "ok" | "cancelled";

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

    /** Копия собранных данных. */
    getData(): FormData {
        return { ...this.data };
    }

    /** Значение одного поля. Для незаполненных возвращает `fallback`. */
    get(key: string, fallback: FieldValue = ""): FieldValue {
        return this.data[key] ?? fallback;
    }

    /**
     * Данные как блок YAML — то, что кладут между `---` в шапке заметки.
     * Ограничители не добавляем: их ставит вызывающий код.
     */
    asFrontmatter(): string {
        if (Object.keys(this.data).length === 0) return "";
        return stringifyYaml(this.data).trimEnd();
    }

    /** Данные как inline-свойства Dataview: `ключ:: значение`. */
    asDataview(): string {
        return Object.entries(this.data)
            .map(([key, value]) => `${key}:: ${value}`)
            .join("\n");
    }

    /** Данные как маркированный список. */
    asList(): string {
        return Object.entries(this.data)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join("\n");
    }

    /**
     * Подстановка в шаблон: `{{ ключ }}`. Неизвестные ключи остаются в тексте
     * как есть — так опечатку видно сразу, а не по пустому месту.
     */
    asString(template: string): string {
        return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
            const value = this.data[key];
            return value === undefined ? match : String(value);
        });
    }

    toString(): string {
        return this.asFrontmatter();
    }
}
