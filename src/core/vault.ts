import { App, getAllTags, TFile } from "obsidian";
import type { SelectOption } from "./types";

/**
 * Запросы к хранилищу. Вместе с attachments.ts это единственные модули в
 * core, которым нужен Obsidian — остальные обходятся без него.
 */

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
