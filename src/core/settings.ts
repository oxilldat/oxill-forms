import type { FieldDefinition, FormDefinition, PluginSettings } from "./types";

export function defaultSettings(): PluginSettings {
    return { forms: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Разбор data.json. Файл могли поправить руками или он мог остаться от
 * прошлой версии, поэтому всё, что не проходит проверку, отбрасывается,
 * а не роняет плагин. Испорченные поля теряются молча — это осознанный
 * размен: лучше открыть форму без одного поля, чем не открыть вовсе.
 */
export function parseSettings(raw: unknown): PluginSettings {
    if (!isRecord(raw) || !Array.isArray(raw.forms)) return defaultSettings();

    const forms: FormDefinition[] = [];
    for (const candidate of raw.forms) {
        const form = parseForm(candidate);
        if (form && !forms.some((f) => f.name === form.name)) forms.push(form);
    }
    return { forms };
}

function parseForm(raw: unknown): FormDefinition | null {
    if (!isRecord(raw)) return null;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name === "") return null;

    const title = typeof raw.title === "string" && raw.title.trim() !== "" ? raw.title : name;
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
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name === "") return null;

    const input = parseInput(raw.input);
    if (!input) return null;

    const field: FieldDefinition = { name, input };
    if (typeof raw.label === "string") field.label = raw.label;
    if (typeof raw.description === "string") field.description = raw.description;
    if (raw.required === true) field.required = true;
    return field;
}

function parseInput(raw: Record<string, unknown>): FieldDefinition["input"] | null {
    switch (raw.type) {
        case "text":
        case "textarea":
        case "number":
        case "date":
        case "toggle":
        case "folder":
            return { type: raw.type };
        case "note":
            return { type: "note", folder: typeof raw.folder === "string" ? raw.folder : "" };
        case "select": {
            const rawOptions = Array.isArray(raw.options) ? raw.options : [];
            const options = rawOptions.flatMap((option) => {
                if (!isRecord(option) || typeof option.value !== "string") return [];
                const value = option.value;
                const label = typeof option.label === "string" && option.label !== "" ? option.label : value;
                return [{ value, label }];
            });
            return { type: "select", options };
        }
        default:
            return null;
    }
}
