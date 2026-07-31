import { t } from "../i18n";
import type { CommandMode, ConditionKind, InputTypeName, OpenMode, OutputFormat } from "./types";

/**
 * Подписи к вариантам выбора. Функциями, а не готовыми объектами: язык
 * меняется в настройках на лету, и посчитанная один раз при загрузке таблица
 * так и осталась бы на прежнем языке.
 */

export function inputTypeLabel(type: InputTypeName): string {
    return t(`type.${type}`);
}

/** Все типы полей в порядке показа в списке выбора. */
export const INPUT_TYPE_ORDER: InputTypeName[] = [
    "section",
    "text",
    "textarea",
    "email",
    "tel",
    "number",
    "slider",
    "toggle",
    "date",
    "time",
    "datetime",
    "select",
    "multiselect",
    "tag",
    "dataview",
    "note",
    "folder",
    "image",
    "file",
];

export function outputFormatLabel(format: OutputFormat): string {
    return t(`format.${format}`);
}

export const OUTPUT_FORMAT_ORDER: OutputFormat[] = ["frontmatter", "dataview", "list"];

export function commandModeLabel(mode: CommandMode): string {
    return t(`mode.${mode}`);
}

export const COMMAND_MODE_ORDER: CommandMode[] = ["update", "create", "insert"];

export function openModeLabel(mode: OpenMode): string {
    return t(`open.${mode}`);
}

export const OPEN_MODE_ORDER: OpenMode[] = ["current", "tab", "split", "none"];

export function conditionLabel(kind: ConditionKind): string {
    return t(`condition.${kind}`);
}
