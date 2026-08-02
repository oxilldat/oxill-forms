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

/** Символы, недопустимые в имени файла. Косая черта тоже: она делит путь. */
// eslint-disable-next-line no-control-regex -- управляющие символы тут и есть цель: значение приезжает из буфера обмена, а NUL или перевод строки ломают имя молча
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;

/** То же, но без косой черты — в пути она разделитель, а не мусор. */
// eslint-disable-next-line no-control-regex -- тот же набор и та же причина, что у FORBIDDEN выше
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
    now = new Date(),
): string {
    const source = template?.trim() ?? "";
    const rendered = source === "" ? "" : renderTemplate(source, data, now);
    const name = tidy(rendered.replace(FORBIDDEN, "-"));
    return name === "" ? tidy(fallback.replace(FORBIDDEN, "-")) || t("note.unnamed") : name;
}

/**
 * Папка по шаблону. Пустые куски выбрасываем целиком: «Книги/{{genre}}» без
 * жанра должно давать «Книги», а не «Книги/» и не «Книги//Название».
 */
export function renderNoteFolder(
    template: string | undefined,
    data: FormData,
    now = new Date(),
): string {
    const source = template?.trim() ?? "";
    if (source === "") return "";

    return renderTemplate(source, data, now)
        .replace(FORBIDDEN_IN_PATH, "-")
        .split("/")
        .map((segment) => tidy(segment))
        .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
        .join("/");
}
