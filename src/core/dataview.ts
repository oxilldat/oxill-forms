import { App } from "obsidian";
import { t } from "../i18n";
import type { FormData } from "./FormResult";

/**
 * Выполнение пользовательских запросов к Dataview.
 *
 * Здесь единственное место, где плагин исполняет чужой код. Запрос пишет
 * владелец хранилища, и он получает доступ к API Dataview — то есть ко всем
 * заметкам. Пока формы создаются вручную, это безопасно; если появится
 * импорт форм со стороны, пользователя надо будет предупреждать.
 */

export class DataviewError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DataviewError";
    }
}

/** Конструктор асинхронной функции — обычный `new Function`, но с await. */
const AsyncFunction = Object.getPrototypeOf(async function () {
    /* пусто */
}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>;

interface PluginRegistry {
    plugins?: { plugins?: Record<string, { api?: unknown } | undefined> };
}

function dataviewApi(app: App): unknown | undefined {
    return (app as App & PluginRegistry).plugins?.plugins?.["dataview"]?.api;
}

export function isDataviewAvailable(app: App): boolean {
    return dataviewApi(app) !== undefined;
}

/**
 * Приводит результат запроса к обычному массиву. Dataview отдаёт свой
 * DataArray, а не настоящий массив, поэтому проверки `Array.isArray`
 * недостаточно — на ней легко споткнуться.
 */
function toArray(value: unknown): unknown[] | null {
    if (Array.isArray(value)) return value;
    if (value === null || typeof value !== "object") return null;

    const asDataArray = value as { array?: unknown };
    if (typeof asDataArray.array === "function") {
        const unwrapped = (asDataArray.array as () => unknown)();
        if (Array.isArray(unwrapped)) return unwrapped;
    }

    const iterable = value as Iterable<unknown>;
    if (typeof iterable[Symbol.iterator] === "function") return [...iterable];

    return null;
}

/**
 * Запускает запрос и возвращает список строк для подсказки.
 * Запросу передаются `dv`, `pages` и `form` — текущие значения формы, за счёт
 * чего один список может зависеть от другого поля.
 */
export async function runDataviewQuery(
    app: App,
    query: string,
    form: FormData,
): Promise<string[]> {
    const api = dataviewApi(app);
    if (api === undefined) {
        throw new DataviewError(t("dataview.missing"));
    }

    const trimmed = query.trim();
    if (trimmed === "") throw new DataviewError(t("dataview.emptyQuery"));

    // Позволяем писать как выражение, так и полноценное тело с return.
    const body = /^return\b/.test(trimmed) ? trimmed : `return ${trimmed}`;

    let raw: unknown;
    try {
        const run = new AsyncFunction("dv", "pages", "form", `"use strict";\n${body}`);
        raw = await run(api, (api as { pages?: unknown }).pages, form);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new DataviewError(t("dataview.queryError", { reason }));
    }

    const list = toArray(raw);
    if (list === null) {
        throw new DataviewError(t("dataview.notAList"));
    }

    return list.filter((item) => item !== null && item !== undefined).map((item) => String(item));
}
