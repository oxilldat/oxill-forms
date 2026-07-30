import assert from "node:assert/strict";
import { test } from "node:test";
import type { App, TFile } from "obsidian";
import { scanNotes } from "./noteMigration";
import type { FormDefinition } from "./types";

/**
 * Обходимся подставным приложением: scanNotes читает только список заметок и
 * их frontmatter, поэтому настоящий Obsidian для проверки правила опознания
 * не нужен.
 */
function fakeApp(notes: Record<string, Record<string, unknown>>): App {
    const files = Object.keys(notes).map((path) => ({ path, basename: path }) as TFile);
    return {
        vault: { getMarkdownFiles: () => files },
        metadataCache: {
            getFileCache: (file: TFile) => ({ frontmatter: notes[file.path] }),
        },
    } as unknown as App;
}

const bookForm: FormDefinition = {
    name: "book",
    title: "Книга",
    version: 2,
    renames: [{ version: 2, from: "rating", to: "score" }],
    fields: [
        { name: "title", input: { type: "text" } },
        { name: "score", input: { type: "number" } },
    ],
};

test("находит заметку со старым ключом и полем формы", () => {
    const app = fakeApp({
        "Книги/Война и мир.md": { title: "Война и мир", rating: 9 },
    });
    const found = scanNotes(app, [bookForm]);
    assert.equal(found.length, 1);
    assert.deepEqual(found[0]?.renames, [{ version: 2, from: "rating", to: "score" }]);
});

test("не трогает заметку, где нет ни одного поля формы", () => {
    // Ровно этот случай: у фильма своя оценка, к книгам он отношения не имеет.
    const app = fakeApp({
        "Фильмы/Начало.md": { film: "Начало", director: "Нолан", rating: 8 },
    });
    assert.deepEqual(scanNotes(app, [bookForm]), []);
});

test("не трогает заметку, где новый ключ уже на месте", () => {
    const app = fakeApp({
        "Книги/Дюна.md": { title: "Дюна", score: 8 },
    });
    assert.deepEqual(scanNotes(app, [bookForm]), []);
});

test("не перезаписывает заметку, где есть и старый ключ, и новый", () => {
    // Значение в новом ключе осмысленное, затирать его нельзя.
    const app = fakeApp({
        "Книги/Спорная.md": { title: "Спорная", rating: 5, score: 9 },
    });
    assert.deepEqual(scanNotes(app, [bookForm]), []);
});

test("заметки без frontmatter пропускаются", () => {
    const app = fakeApp({ "Просто текст.md": undefined as unknown as Record<string, unknown> });
    assert.deepEqual(scanNotes(app, [bookForm]), []);
});

test("форма без истории переименований ничего не ищет", () => {
    const app = fakeApp({ "Книги/Война и мир.md": { title: "Война и мир", rating: 9 } });
    const withoutRenames: FormDefinition = { ...bookForm, renames: [] };
    assert.deepEqual(scanNotes(app, [withoutRenames]), []);
});

test("несколько переименований в одной заметке собираются вместе", () => {
    const form: FormDefinition = {
        ...bookForm,
        version: 3,
        renames: [
            { version: 2, from: "rating", to: "score" },
            { version: 3, from: "note", to: "review" },
        ],
        fields: [
            { name: "title", input: { type: "text" } },
            { name: "score", input: { type: "number" } },
            { name: "review", input: { type: "textarea" } },
        ],
    };
    const app = fakeApp({
        "Книги/Старая.md": { title: "Старая", rating: 7, note: "текст" },
    });
    const found = scanNotes(app, [form]);
    assert.equal(found.length, 1);
    assert.equal(found[0]?.renames.length, 2);
});
