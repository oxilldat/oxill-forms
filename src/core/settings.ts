import type {
    CommandMode,
    ConditionKind,
    FieldCondition,
    FieldDefinition,
    FieldRename,
    FormCommand,
    FormDefinition,
    InputType,
    OutputFormat,
    PluginSettings,
} from "./types";

export function defaultSettings(): PluginSettings {
    return {
        forms: [],
        // Пустой путь означает корень хранилища. Навязывать свою структуру
        // папок не хотим — пусть решает владелец хранилища.
        imageFolder: "",
        fileFolder: "",
        skipDiscardConfirm: false,
        dataviewEnabled: false,
        // Правка чужих заметок — единственное, что плагин меняет за пределами
        // своих данных. Такое должно происходить по явной команде, а не само.
        autoUpdateNotes: false,
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
        skipDiscardConfirm: raw.skipDiscardConfirm === true,
        dataviewEnabled: raw.dataviewEnabled === true,
        autoUpdateNotes: raw.autoUpdateNotes === true,
    };
}

/**
 * Разбор одной формы из чужого источника — вставленного JSON при импорте.
 * Те же правила, что при чтении data.json: непонятное отбрасывается.
 */
export function parseFormDefinition(raw: unknown): FormDefinition | null {
    return parseForm(raw);
}

/** Есть ли в форме поля, исполняющие код. Нужно предупредить при импорте. */
export function formCodeFields(form: FormDefinition): { field: string; query: string }[] {
    return form.fields.flatMap((field) =>
        field.input.type === "dataview"
            ? [{ field: field.label?.trim() || field.name, query: field.input.query }]
            : [],
    );
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

    // Формы, созданные до появления нумерации, все одной формы — считаем их
    // первой версией. Пока формат не переделывался, это допущение верное.
    const version = Math.max(1, Math.trunc(asNumber(raw.version, 1)));

    const form: FormDefinition = { name, title, version, fields };

    const folder = asString(raw.folder).trim();
    if (folder !== "") form.folder = folder;

    const icon = asString(raw.icon).trim();
    if (icon !== "") form.icon = icon;

    const command = parseCommand(raw.command);
    if (command) form.command = command;

    if (typeof raw.template === "string" && raw.template.trim() !== "") {
        form.template = raw.template;
    }

    const renames = parseRenames(raw.renames);
    if (renames.length > 0) form.renames = renames;

    return form;
}

/**
 * Раньше команда была просто `true`. Такие формы читаем как вставку в
 * текущую заметку свойствами — именно так команда себя и вела.
 */
function parseCommand(raw: unknown): FormCommand | null {
    if (raw === true) return { enabled: true, mode: "insert", format: "dataview" };
    if (!isRecord(raw)) return null;

    const command: FormCommand = {
        enabled: raw.enabled === true,
        mode: isCommandMode(raw.mode) ? raw.mode : "insert",
        format: isOutputFormat(raw.format) ? raw.format : "dataview",
    };

    const folder = asString(raw.folder).trim();
    if (folder !== "") command.folder = folder;

    const nameField = asString(raw.nameField).trim();
    if (nameField !== "") command.nameField = nameField;

    return command;
}

function isCommandMode(value: unknown): value is CommandMode {
    return value === "update" || value === "create" || value === "insert";
}

function isOutputFormat(value: unknown): value is OutputFormat {
    return value === "frontmatter" || value === "dataview" || value === "list";
}

function parseRenames(raw: unknown): FieldRename[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((candidate) => {
        if (!isRecord(candidate)) return [];
        const from = asString(candidate.from).trim();
        const to = asString(candidate.to).trim();
        if (from === "" || to === "" || from === to) return [];
        return [{ version: Math.max(1, Math.trunc(asNumber(candidate.version, 1))), from, to }];
    });
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
    if (typeof raw.placeholder === "string") field.placeholder = raw.placeholder;
    if (typeof raw.default === "string") field.default = raw.default;
    if (raw.required === true) field.required = true;
    if (raw.hidden === true) field.hidden = true;

    const condition = parseCondition(raw.condition);
    if (condition) field.condition = condition;

    return field;
}

function parseCondition(raw: unknown): FieldCondition | null {
    if (!isRecord(raw)) return null;

    const field = asString(raw.field).trim();
    if (field === "") return null;

    const kind = raw.kind;
    if (!isConditionKind(kind)) return null;

    const condition: FieldCondition = { field, kind };
    if (typeof raw.value === "string" || typeof raw.value === "number") {
        condition.value = raw.value;
    }
    return condition;
}

function isConditionKind(value: unknown): value is ConditionKind {
    return (
        value === "isSet" ||
        value === "equals" ||
        value === "contains" ||
        value === "startsWith" ||
        value === "endsWith" ||
        value === "above" ||
        value === "below" ||
        value === "isTrue" ||
        value === "isFalse"
    );
}

function parseInput(raw: Record<string, unknown>): InputType | null {
    switch (raw.type) {
        case "section":
        case "text":
        case "textarea":
        case "email":
        case "tel":
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

        case "dataview":
            return { type: "dataview", query: asString(raw.query) };

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
