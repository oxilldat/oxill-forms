/**
 * Разбор списка допустимых расширений у поля «Файл». Отдельный модуль, а не
 * часть attachments.ts: там уже есть Obsidian, а этим правилам он не нужен —
 * значит, их можно проверять тестами.
 */

export function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Список из того, что написал человек: «jpg, .PDF; docx» — всё это одно и то
 * же. Точку и регистр снимаем, повторы отбрасываем, порядок сохраняем — он
 * задан руками и в подсказке читается как есть.
 */
export function parseExtensions(raw: unknown): string[] {
    const parts =
        typeof raw === "string"
            ? raw.split(/[\s,;]+/)
            : Array.isArray(raw)
              ? raw.map((item) => (typeof item === "string" ? item : ""))
              : [];

    const result: string[] = [];
    for (const part of parts) {
        const extension = part.trim().replace(/^\.+/, "").toLowerCase();
        if (extension !== "" && !result.includes(extension)) result.push(extension);
    }
    return result;
}

/** Обратно в строку для поля ввода в редакторе. */
export function formatExtensions(extensions: string[]): string {
    return extensions.join(", ");
}

/** Пустой список означает «любые»: ограничение не задано. */
export function isAllowedExtension(fileName: string, extensions: string[]): boolean {
    if (extensions.length === 0) return true;
    return extensions.includes(extensionOf(fileName));
}

/** Значение для атрибута accept: фильтр в системном окне выбора файла. */
export function acceptAttribute(extensions: string[]): string {
    return extensions.map((extension) => `.${extension}`).join(",");
}
