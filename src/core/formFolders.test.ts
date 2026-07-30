import assert from "node:assert/strict";
import { test } from "node:test";
import { folderExists, folderNames, formsInFolder, groupByFolder } from "./formFolders";
import type { FormDefinition } from "./types";

function form(name: string, folder?: string): FormDefinition {
    return { name, title: name, version: 1, folder, fields: [] };
}

const forms = [
    form("book", "Чтение"),
    form("article", "Чтение"),
    form("meeting", "Работа"),
    form("idea"),
];

test("названия папок собираются без повторов и по алфавиту", () => {
    assert.deepEqual(folderNames(forms), ["Работа", "Чтение"]);
});

test("формы без папки в список названий не попадают", () => {
    assert.deepEqual(folderNames([form("idea")]), []);
});

test("пробелы по краям названия не создают вторую папку", () => {
    assert.deepEqual(folderNames([form("a", "Чтение"), form("b", " Чтение ")]), ["Чтение"]);
});

test("группировка считает формы и ставит «без папки» последней", () => {
    assert.deepEqual(groupByFolder(forms), [
        { name: "Работа", count: 1 },
        { name: "Чтение", count: 2 },
        { name: "", count: 1 },
    ]);
});

test("раздела «без папки» нет, когда все формы разложены", () => {
    const tidy = [form("book", "Чтение"), form("meeting", "Работа")];
    assert.deepEqual(groupByFolder(tidy), [
        { name: "Работа", count: 1 },
        { name: "Чтение", count: 1 },
    ]);
});

test("выборка по папке, null — все формы", () => {
    assert.deepEqual(
        formsInFolder(forms, "Чтение").map((f) => f.name),
        ["book", "article"],
    );
    assert.deepEqual(
        formsInFolder(forms, "").map((f) => f.name),
        ["idea"],
    );
    assert.equal(formsInFolder(forms, null).length, 4);
});

test("исчезнувшая папка перестаёт существовать", () => {
    // После удаления последней формы папки выбор нужно сбросить на «все».
    assert.equal(folderExists(forms, "Работа"), true);
    assert.equal(folderExists([form("idea")], "Работа"), false);
    assert.equal(folderExists([], null), true);
});
