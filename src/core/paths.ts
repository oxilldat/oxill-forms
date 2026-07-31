/**
 * Правила про пути хранилища. Отдельно от vault.ts: там Obsidian, а здесь
 * только строки — значит, это можно проверить тестами.
 */

/**
 * Приводит папку к виду, годному для сравнения началом пути. Корень
 * хранилища — пустая строка и «/» — даёт пустой префикс: внутри него лежит
 * всё, и никакой отбор не нужен.
 */
export function folderPrefix(folder: string | undefined): string {
    const trimmed = (folder ?? "").trim().replace(/^\/+|\/+$/g, "");
    return trimmed === "" ? "" : `${trimmed}/`;
}

/**
 * Лежит ли путь внутри папки. Сама папка своим потомком не считается: выбор
 * «внутри Проектов» про то, что лежит в них, а не про них самих.
 *
 * Сравнение с косой чертой на конце обязательно: иначе «Проекты 2026»
 * оказались бы внутри «Проекты».
 */
export function isInsideFolder(path: string, folder: string | undefined): boolean {
    const prefix = folderPrefix(folder);
    if (prefix === "") return true;
    return path.startsWith(prefix);
}
