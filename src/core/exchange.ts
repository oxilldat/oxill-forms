import { parseFormDefinition } from "./settings";
import type { FormDefinition } from "./types";

/**
 * Обмен формами между хранилищами. Экспорт всегда пишет конверт с версией
 * плагина: без неё форма, сделанная в новой версии, молча теряла бы поля
 * при открытии в старой.
 */

export const EXCHANGE_MARKER = "modal-forms-lite";

export interface FormBundle {
    plugin: typeof EXCHANGE_MARKER;
    version: string;
    exported: string;
    forms: FormDefinition[];
}

export function makeBundle(forms: FormDefinition[], pluginVersion: string): FormBundle {
    return {
        plugin: EXCHANGE_MARKER,
        version: pluginVersion,
        exported: new Date().toISOString().slice(0, 10),
        forms,
    };
}

export function bundleToJson(forms: FormDefinition[], pluginVersion: string): string {
    return JSON.stringify(makeBundle(forms, pluginVersion), null, 2);
}

export interface ParsedBundle {
    forms: FormDefinition[];
    /** Версия плагина, в которой сделан экспорт. Пусто у голого JSON формы. */
    version?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Принимает три вида JSON: конверт с версией, голый массив форм и одну форму.
 * Последние два — чтобы вставленный кусок из чужого data.json тоже работал.
 */
export function parseBundle(raw: unknown): ParsedBundle | null {
    if (Array.isArray(raw)) {
        const forms = raw.map(parseFormDefinition).filter((form): form is FormDefinition => !!form);
        return forms.length > 0 ? { forms } : null;
    }

    if (isRecord(raw) && Array.isArray(raw.forms)) {
        const forms = raw.forms
            .map(parseFormDefinition)
            .filter((form): form is FormDefinition => !!form);
        if (forms.length === 0) return null;
        return typeof raw.version === "string" ? { forms, version: raw.version } : { forms };
    }

    const single = parseFormDefinition(raw);
    return single ? { forms: [single] } : null;
}

/**
 * Сравнение версий вида 1.2.3. Возвращает true, если экспорт сделан в более
 * новой версии плагина, чем установленная, — тогда что-то может не читаться.
 */
export function isNewerVersion(exported: string, current: string): boolean {
    const parse = (value: string) =>
        value.split(".").map((part) => {
            const number = Number(part);
            return Number.isFinite(number) ? number : 0;
        });

    const left = parse(exported);
    const right = parse(current);
    const length = Math.max(left.length, right.length);

    for (let index = 0; index < length; index++) {
        const a = left[index] ?? 0;
        const b = right[index] ?? 0;
        if (a !== b) return a > b;
    }
    return false;
}
