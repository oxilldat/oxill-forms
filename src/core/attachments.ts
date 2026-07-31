import { App } from "obsidian";
import { extensionOf } from "./extensions";
import { ensureFolder, freePath } from "./vault";

/** Форматы, которые принимает поле «Изображение». */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

/** Значение для атрибута accept — фильтр в системном диалоге выбора файла. */
export const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

export { extensionOf };

export function isAllowedImage(fileName: string): boolean {
    return IMAGE_EXTENSIONS.includes(extensionOf(fileName));
}

/** Убирает символы, недопустимые в путях хранилища. */
export function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[<>:"/\\|?*]/g, "-").trim();
}

/**
 * Кладёт выбранный файл в хранилище и возвращает путь от его корня.
 *
 * Имя по умолчанию исходное — по нему потом проще искать файл глазами.
 * `baseName` задаётся шаблоном имени у поля; расширение в любом случае
 * остаётся от самого файла, иначе Obsidian перестанет его узнавать.
 */
export async function saveAttachment(
    app: App,
    file: File,
    folder: string,
    baseName?: string,
): Promise<string> {
    await ensureFolder(app, folder);

    const clean = sanitizeFileName(file.name);
    const extension = extensionOf(clean);
    const original = extension === "" ? clean : clean.slice(0, clean.length - extension.length - 1);

    const wanted = sanitizeFileName(baseName ?? "");
    const base = wanted !== "" ? wanted : original === "" ? "file" : original;
    const path = freePath(app, folder, base, extension);

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
