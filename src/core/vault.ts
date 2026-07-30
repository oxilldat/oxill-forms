import { App, getAllTags, normalizePath, TFile } from "obsidian";
import type { SelectOption } from "./types";

/**
 * Запросы к хранилищу. Вместе с attachments.ts это единственные модули в
 * core, которым нужен Obsidian — остальные обходятся без него.
 */

/**
 * Создаёт папку вместе со всеми родительскими. Obsidian бросает исключение,
 * если папка уже есть, поэтому каждый уровень проверяем отдельно.
 */
export async function ensureFolder(app: App, folder: string): Promise<void> {
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
export function freePath(app: App, folder: string, base: string, extension: string): string {
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
 * Создаёт заметку и возвращает её. Папка создаётся при необходимости, имя
 * дедуплицируется — существующую заметку не перезаписываем никогда.
 */
export async function createNote(
    app: App,
    folder: string,
    baseName: string,
    content: string,
): Promise<TFile> {
    await ensureFolder(app, folder);
    const path = freePath(app, folder, baseName, "md");
    return app.vault.create(path, content);
}

/** Заметки указанной папки. Пустой путь означает всё хранилище. */
export function notesIn(app: App, folder: string): TFile[] {
    const trimmed = folder.trim().replace(/\/$/, "");
    const prefix = trimmed === "" || trimmed === "/" ? "" : `${trimmed}/`;
    return app.vault
        .getMarkdownFiles()
        .filter((file) => file.path.startsWith(prefix))
        .sort((a, b) => a.basename.localeCompare(b.basename));
}

/** Имена заметок папки как варианты выбора. */
export function noteOptions(app: App, folder: string): SelectOption[] {
    return notesIn(app, folder).map((file) => ({
        value: file.basename,
        label: file.basename,
    }));
}

/**
 * Все теги хранилища без ведущей решётки. Публичного способа получить их
 * одним вызовом нет, поэтому обходим заметки и собираем из кеша. Список
 * стоит вычислять один раз при открытии формы, а не на каждое нажатие.
 */
export function vaultTags(app: App): SelectOption[] {
    const tags = new Set<string>();
    for (const file of app.vault.getMarkdownFiles()) {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache) continue;
        for (const tag of getAllTags(cache) ?? []) {
            tags.add(tag.replace(/^#/, ""));
        }
    }
    return [...tags]
        .sort((a, b) => a.localeCompare(b))
        .map((tag) => ({ value: tag, label: tag }));
}
