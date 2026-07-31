import type { FormDefinition } from "./types";

/**
 * Раскладка форм по папкам. Папка здесь — просто ярлык у формы, никакой
 * иерархии и никакой связи с папками хранилища: когда форм становится сто,
 * нужен способ их разложить, а не файловая система.
 *
 * Папка существует, если её носит хотя бы одна форма ИЛИ она записана в
 * настройках. Второе нужно для пустых папок: создать папку и разложить в неё
 * формы потом — обычный порядок работы, а выводить список только из форм
 * значит терять пустую папку сразу после создания.
 */

/** Иконка формы, если своя не выбрана. */
export const DEFAULT_FORM_ICON = "clipboard-list";

export interface FolderEntry {
    /** Пустая строка — раздел «Без папки». */
    name: string;
    count: number;
}

function folderOf(form: FormDefinition): string {
    return form.folder?.trim() ?? "";
}

/** Названия существующих папок по алфавиту. Без пустой. */
export function folderNames(forms: FormDefinition[], known: string[] = []): string[] {
    const names = new Set<string>();
    for (const form of forms) {
        const folder = folderOf(form);
        if (folder !== "") names.add(folder);
    }
    for (const folder of known) {
        const name = folder.trim();
        if (name !== "") names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Папки со счётчиками для левой колонки. «Без папки» всегда последняя и
 * появляется, только если такие формы есть.
 */
export function groupByFolder(forms: FormDefinition[], known: string[] = []): FolderEntry[] {
    const entries = folderNames(forms, known).map((name) => ({
        name,
        count: forms.filter((form) => folderOf(form) === name).length,
    }));

    const loose = forms.filter((form) => folderOf(form) === "").length;
    if (loose > 0) entries.push({ name: "", count: loose });

    return entries;
}

/** Формы выбранной папки. `null` означает «показать все». */
export function formsInFolder(forms: FormDefinition[], folder: string | null): FormDefinition[] {
    if (folder === null) return forms;
    return forms.filter((form) => folderOf(form) === folder);
}

/**
 * Показывать ли строку «Все формы». Прячем её только по просьбе владельца
 * хранилища и только когда всё разложено: пока есть формы без папки, через
 * эту строку до них добираться, а если папок нет вовсе — выбирать в колонке
 * было бы нечего и она осталась бы пустой.
 */
export function showsAllForms(
    forms: FormDefinition[],
    known: string[],
    hideWhenTidy: boolean,
): boolean {
    if (!hideWhenTidy) return true;
    if (forms.some((form) => folderOf(form) === "")) return true;
    return folderNames(forms, known).length === 0;
}

/** Существует ли ещё такая папка. Нужно после удаления последней формы в ней. */
export function folderExists(
    forms: FormDefinition[],
    folder: string | null,
    known: string[] = [],
): boolean {
    if (folder === null) return true;
    if (folder === "") return forms.some((form) => folderOf(form) === "");
    return folderNames(forms, known).includes(folder);
}

/**
 * Добавляет папку в список сохранённых. Повторы и регистр не различаем как
 * раз наоборот: «Чтение» и «чтение» — разные ярлыки, потому что ярлык
 * пишется руками и подставляется в формы как есть.
 */
export function addFolder(known: string[], name: string): string[] {
    const folder = name.trim();
    if (folder === "" || known.includes(folder)) return known;
    return [...known, folder];
}

/** Убирает папку из списка сохранённых. Формы при этом не трогаются. */
export function removeFolder(known: string[], name: string): string[] {
    return known.filter((folder) => folder !== name);
}

/**
 * Снимает ярлык папки со всех её форм — они становятся формами «без папки».
 * Именно это и значит «удалить папку»: формы живут сами по себе, папка их не
 * содержит, а только помечает.
 */
export function clearFolder(forms: FormDefinition[], name: string): FormDefinition[] {
    return forms.map((form) => {
        if (folderOf(form) !== name) return form;
        const { folder, ...rest } = form;
        return rest;
    });
}
