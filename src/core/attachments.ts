import { App, normalizePath } from "obsidian";

/** Форматы, которые принимает поле «Изображение». */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

/** Значение для атрибута accept — фильтр в системном диалоге выбора файла. */
export const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

export function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf(".");
    return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export function isAllowedImage(fileName: string): boolean {
    return IMAGE_EXTENSIONS.includes(extensionOf(fileName));
}

/** Убирает символы, недопустимые в путях хранилища. */
export function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[<>:"/\\|?*]/g, "-").trim();
}

/**
 * Создаёт папку вместе со всеми родительскими. Obsidian бросает исключение,
 * если папка уже есть, поэтому каждый уровень проверяем отдельно.
 */
async function ensureFolder(app: App, folder: string): Promise<void> {
    const path = normalizePath(folder);
    if (path === "" || path === "/" || path === ".") return;

    let current = "";
    for (const part of path.split("/")) {
        if (part === "") continue;
        current = current === "" ? part : `${current}/${part}`;
        if (!app.vault.getAbstractFileByPath(current)) {
            await app.vault.createFolder(current);
        }
    }
}

/** Подбирает незанятый путь, добавляя «-1», «-2» к имени файла. */
function freePath(app: App, folder: string, base: string, extension: string): string {
    const directory = normalizePath(folder);
    const prefix = directory === "" || directory === "/" || directory === "." ? "" : `${directory}/`;
    const suffix = extension === "" ? "" : `.${extension}`;

    let candidate = `${prefix}${base}${suffix}`;
    let counter = 1;
    while (app.vault.getAbstractFileByPath(candidate)) {
        candidate = `${prefix}${base}-${counter}${suffix}`;
        counter++;
    }
    return candidate;
}

/**
 * Кладёт выбранный файл в хранилище и возвращает путь от его корня.
 * Имя сохраняем исходное — по нему потом проще искать файл глазами.
 */
export async function saveAttachment(app: App, file: File, folder: string): Promise<string> {
    await ensureFolder(app, folder);

    const clean = sanitizeFileName(file.name);
    const extension = extensionOf(clean);
    const base = extension === "" ? clean : clean.slice(0, clean.length - extension.length - 1);
    const path = freePath(app, folder, base === "" ? "file" : base, extension);

    await app.vault.createBinary(path, await file.arrayBuffer());
    return path;
}

/**
 * Ссылка на файл без восклицательного знака: заметка получает ссылку, а не
 * встроенное изображение. Встраивание при необходимости делается в шаблоне.
 */
export function toWikiLink(path: string): string {
    return `[[${path}]]`;
}
