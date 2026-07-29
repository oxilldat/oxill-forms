import type { FieldDefinition, FormDefinition, InputType, PluginSettings } from "./types";

export function defaultSettings(): PluginSettings {
    return {
        forms: [],
        // Пустой путь означает корень хранилища. Навязывать свою структуру
        // папок не хотим — пусть решает владелец хранилища.
        imageFolder: "",
        fileFolder: "",
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Разбор data.json. Файл могли поправить руками или он мог остаться от
 * прошлой версии, поэтому всё, что не проходит проверку, отбрасывается,
 * а не роняет плагин.
 */
export function parseSettings(raw: unknown): PluginSettings {
    const defaults = defaultSettings();
    if (!isRecord(raw)) return defaults;

    const forms: FormDefinition[] = [];
    if (Array.isArray(raw.forms)) {
        for (const candidate of raw.forms) {
            const form = parseForm(candidate);
            if (form && !forms.some((f) => f.name === form.name)) forms.push(form);
        }
    }

    return {
        forms,
        imageFolder: asString(raw.imageFolder, defaults.imageFolder),
        fileFolder: asString(raw.fileFolder, defaults.fileFolder),
    };
}

function parseForm(raw: unknown): FormDefinition | null {
    if (!isRecord(raw)) return null;
    const name = asString(raw.name).trim();
    if (name === "") return null;

    const title = asString(raw.title).trim() === "" ? name : asString(raw.title);
    const rawFields = Array.isArray(raw.fields) ? raw.fields : [];

    const fields: FieldDefinition[] = [];
    for (const candidate of rawFields) {
        const field = parseField(candidate);
        if (field && !fields.some((f) => f.name === field.name)) fields.push(field);
    }
    return { name, title, fields };
}

function parseField(raw: unknown): FieldDefinition | null {
    if (!isRecord(raw) || !isRecord(raw.input)) return null;
    const name = asString(raw.name).trim();
    if (name === "") return null;

    const input = parseInput(raw.input);
    if (!input) return null;

    const field: FieldDefinition = { name, input };
    if (typeof raw.label === "string") field.label = raw.label;
    if (typeof raw.description === "string") field.description = raw.description;
    if (raw.required === true) field.required = true;
    return field;
}

function parseInput(raw: Record<string, unknown>): InputType | null {
    switch (raw.type) {
        case "text":
        case "textarea":
        case "number":
        case "toggle":
        case "date":
        case "time":
        case "datetime":
        case "tag":
        case "folder":
        case "image":
        case "file":
            return { type: raw.type };

        case "note":
            return { type: "note", folder: asString(raw.folder) };

        case "slider": {
            const min = asNumber(raw.min, 0);
            const max = asNumber(raw.max, 10);
            const step = asNumber(raw.step, 1);
            return { type: "slider", min, max, step: step > 0 ? step : 1 };
        }

        case "select":
        case "multiselect": {
            const kind = raw.type;
            if (raw.source === "notes") {
                return { type: kind, source: "notes", folder: asString(raw.folder) };
            }
            // Формы, созданные до появления `source`, были списком значений.
            const rawOptions = Array.isArray(raw.options) ? raw.options : [];
            const options = rawOptions.flatMap((option) => {
                if (!isRecord(option) || typeof option.value !== "string") return [];
                const value = option.value;
                const label = asString(option.label) === "" ? value : asString(option.label);
                return [{ value, label }];
            });
            return { type: kind, source: "fixed", options };
        }

        default:
            return null;
    }
}
