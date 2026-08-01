// Только типы: модуль ничего не создаёт из Obsidian, поэтому его логику
// можно проверять тестами без запуска приложения.
import type { App, TFile } from "obsidian";
import type { FieldRename, FormDefinition } from "./types";

/**
 * Починка заметок после переименования поля.
 *
 * Важное ограничение: заметка не помнит, какой формой она создана. Опознаём
 * по frontmatter, и чтобы не портить чужие заметки, требуем два признака
 * одновременно: в заметке есть старый ключ И есть хотя бы один ключ,
 * совпадающий с текущим полем этой формы. Совпадение по одному ключу
 * (например, `rating` в заметке про фильм) под починку не попадёт.
 */

export interface NoteUpdate {
    file: TFile;
    formName: string;
    renames: FieldRename[];
}

function frontmatterOf(app: App, file: TFile): Record<string, unknown> | undefined {
    return app.metadataCache.getFileCache(file)?.frontmatter;
}

/** Какие переименования применимы к этой заметке от имени этой формы. */
function applicableRenames(
    form: FormDefinition,
    frontmatter: Record<string, unknown>,
): FieldRename[] {
    const renames = form.renames ?? [];
    if (renames.length === 0) return [];

    const hasCurrentField = form.fields.some((field) => field.name in frontmatter);
    if (!hasCurrentField) return [];

    return renames.filter((rename) => {
        if (!(rename.from in frontmatter)) return false;
        // Новый ключ уже на месте — значит заметку либо починили, либо там
        // осмысленное значение, которое затирать нельзя.
        return !(rename.to in frontmatter);
    });
}

/** Ищет заметки, где остались старые названия полей. Ничего не меняет. */
export function scanNotes(app: App, forms: FormDefinition[]): NoteUpdate[] {
    const relevant = forms.filter((form) => (form.renames ?? []).length > 0);
    if (relevant.length === 0) return [];

    const updates: NoteUpdate[] = [];
    for (const file of app.vault.getMarkdownFiles()) {
        const frontmatter = frontmatterOf(app, file);
        if (!frontmatter) continue;

        for (const form of relevant) {
            const renames = applicableRenames(form, frontmatter);
            if (renames.length === 0) continue;
            updates.push({ file, formName: form.name, renames });
        }
    }
    return updates;
}

/**
 * Применяет найденные переименования. Возвращает число изменённых заметок и
 * список тех, что не поддались — обычно из-за сломанного YAML.
 */
export async function applyNoteUpdates(
    app: App,
    updates: NoteUpdate[],
): Promise<{ changed: number; failed: string[] }> {
    let changed = 0;
    const failed: string[] = [];

    for (const update of updates) {
        try {
            await app.fileManager.processFrontMatter(update.file, (frontmatter: Record<string, unknown>) => {
                for (const rename of update.renames) {
                    if (!(rename.from in frontmatter)) continue;
                    if (rename.to in frontmatter) continue;
                    frontmatter[rename.to] = frontmatter[rename.from];
                    delete frontmatter[rename.from];
                }
            });
            changed++;
        } catch (error) {
            console.error("[oxill-forms] не удалось обновить заметку", update.file.path, error);
            failed.push(update.file.path);
        }
    }

    return { changed, failed };
}
