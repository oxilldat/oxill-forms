import { t } from "../i18n";
import { renderTemplate } from "./format";
import type { FormData } from "./FormResult";

/**
 * Куда и под каким именем ложится созданная заметка. Имя и папка задаются
 * шаблонами с теми же подстановками, что и текст заметки: `{{author}} —
 * {{title}}`, `Книги/{{genre}}`.
 *
 * Здесь только строки, без Obsidian: правила про пустые значения и запрещённые
 * символы — самое неочевидное во всей затее, и проверять их надо тестами.
 */

/*
 * Управляющие символы \u0000-\u001f в наборах ниже — намеренные, и линтер о
 * них предупреждает справедливо: обычно они в регулярке означают опечатку.
 * Здесь наоборот, вычистить их и есть смысл: значение поля приезжает из буфера
 * обмена, а перевод строки или NUL посреди имени ломают файл молча.
 */

/** Символы, недопустимые в имени файла. Косая черта тоже: она делит путь. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;

/** То же, но без косой черты — в пути она разделитель, а не мусор. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_IN_PATH = /[<>:"\\|?*\u0000-\u001f]/g;

/**
 * Незаполненное поле оставляет в шаблоне пустоту, а вокруг неё — осиротевшие
 * разделители: «{{author}} — {{title}}» без автора дал бы « — Война и мир».
 * Поэтому повисшие тире, дефисы и запятые по краям убираем.
 */
function tidy(value: string): string {
    // Разделителем считаем только отдельно стоящее слово из знаков: внутри
    // слова дефис — часть текста, а не разделитель, и «Роман- часть» трогать
    // нельзя.
    const isSeparator = (token: string): boolean => /^[—–\-,;:.]+$/.test(token);

    const kept: string[] = [];
    for (const token of value.split(/\s+/)) {
        if (token === "") continue;
        // Разделитель осмыслен только между двумя настоящими словами.
        if (isSeparator(token) && (kept.length === 0 || isSeparator(kept[kept.length - 1]!))) {
            continue;
        }
        kept.push(token);
    }

    while (kept.length > 0 && isSeparator(kept[kept.length - 1]!)) kept.pop();
    return kept.join(" ");
}

/**
 * Имя заметки по шаблону. Пустой результат — не ошибка: подставляем запасное
 * имя, иначе заметка называлась бы пустой строкой.
 */
export function renderNoteName(
    template: string | undefined,
    data: FormData,
    fallback: string,
): string {
    const source = template?.trim() ?? "";
    const rendered = source === "" ? "" : renderTemplate(source, data);
    const name = tidy(rendered.replace(FORBIDDEN, "-"));
    return name === "" ? tidy(fallback.replace(FORBIDDEN, "-")) || t("note.unnamed") : name;
}

/**
 * Папка по шаблону. Пустые куски выбрасываем целиком: «Книги/{{genre}}» без
 * жанра должно давать «Книги», а не «Книги/» и не «Книги//Название».
 */
export function renderNoteFolder(template: string | undefined, data: FormData): string {
    const source = template?.trim() ?? "";
    if (source === "") return "";

    return renderTemplate(source, data)
        .replace(FORBIDDEN_IN_PATH, "-")
        .split("/")
        .map((segment) => tidy(segment))
        .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
        .join("/");
}
