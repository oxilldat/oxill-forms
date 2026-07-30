import type { FormDefinition } from "./types";

/**
 * Раскладка форм по папкам. Папка здесь — просто ярлык у формы, никакой
 * иерархии и никакой связи с папками хранилища: когда форм становится сто,
 * нужен способ их разложить, а не файловая система.
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
export function folderNames(forms: FormDefinition[]): string[] {
    const names = new Set<string>();
    for (const form of forms) {
        const folder = folderOf(form);
        if (folder !== "") names.add(folder);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Папки со счётчиками для левой колонки. «Без папки» всегда последняя и
 * появляется, только если такие формы есть.
 */
export function groupByFolder(forms: FormDefinition[]): FolderEntry[] {
    const entries = folderNames(forms).map((name) => ({
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

/** Существует ли ещё такая папка. Нужно после удаления последней формы в ней. */
export function folderExists(forms: FormDefinition[], folder: string | null): boolean {
    if (folder === null) return true;
    return forms.some((form) => folderOf(form) === folder);
}
