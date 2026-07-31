import assert from "node:assert/strict";
import { test } from "node:test";
import {
    addFolder,
    clearFolder,
    folderExists,
    folderNames,
    formsInFolder,
    groupByFolder,
    removeFolder,
    showsAllForms,
} from "./formFolders";
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

test("созданная папка живёт и без единой формы", () => {
    assert.deepEqual(folderNames([], ["Черновики"]), ["Черновики"]);
    assert.deepEqual(groupByFolder([], ["Черновики"]), [{ name: "Черновики", count: 0 }]);
    assert.equal(folderExists([], "Черновики", ["Черновики"]), true);
    assert.equal(folderExists([], "Черновики"), false);
});

test("созданная папка не удваивается своими же формами", () => {
    assert.deepEqual(folderNames(forms, ["Чтение", "Черновики"]), [
        "Работа",
        "Черновики",
        "Чтение",
    ]);
});

test("«без папки» остаётся выводом из форм, а не записью в списке", () => {
    // Пустое название в списке — мусор из чужого data.json: раздел «Без
    // папки» существует ровно тогда, когда такие формы есть.
    assert.deepEqual(folderNames([form("idea")], [""]), []);
    assert.equal(folderExists([form("idea")], ""), true);
    assert.equal(folderExists([form("book", "Чтение")], ""), false);
});

test("добавление папки отсекает повтор и пустое название", () => {
    assert.deepEqual(addFolder([], "Чтение"), ["Чтение"]);
    assert.deepEqual(addFolder(["Чтение"], " Чтение "), ["Чтение"]);
    assert.deepEqual(addFolder(["Чтение"], "   "), ["Чтение"]);
});

test("«Все формы» показываются всегда, пока настройка выключена", () => {
    const tidy = [form("book", "Чтение")];
    assert.equal(showsAllForms(tidy, [], false), true);
    assert.equal(showsAllForms(forms, [], false), true);
});

test("«Все формы» скрываются, только когда всё разложено по папкам", () => {
    const tidy = [form("book", "Чтение"), form("meeting", "Работа")];
    assert.equal(showsAllForms(tidy, [], true), false);
    // Есть форма без папки — строка нужна, иначе до формы не добраться.
    assert.equal(showsAllForms(forms, [], true), true);
});

test("«Все формы» остаются, когда папок нет вовсе", () => {
    // Иначе колонка слева осталась бы пустой и выбирать было бы нечего.
    assert.equal(showsAllForms([], [], true), true);
    assert.equal(showsAllForms([form("idea")], [], true), true);
    // Пустая созданная папка — уже есть что выбрать.
    assert.equal(showsAllForms([], ["Черновики"], true), false);
});

test("удаление папки снимает ярлык с её форм, но не трогает сами формы", () => {
    const cleared = clearFolder(forms, "Чтение");
    assert.deepEqual(
        cleared.map((f) => [f.name, f.folder]),
        [
            ["book", undefined],
            ["article", undefined],
            ["meeting", "Работа"],
            ["idea", undefined],
        ],
    );
    // Ключа больше нет вовсе, а не лежит пустой строкой: пустое значение
    // после разбора data.json всё равно отбрасывается.
    assert.equal("folder" in cleared[0]!, false);
    assert.equal(cleared.length, forms.length);
    assert.deepEqual(folderNames(cleared), ["Работа"]);
});

test("удаление папки не задевает формы с похожим ярлыком", () => {
    const mixed = [form("a", "Чтение"), form("b", "Чтение вслух")];
    assert.deepEqual(
        clearFolder(mixed, "Чтение").map((f) => f.folder),
        [undefined, "Чтение вслух"],
    );
});

test("папка убирается из списка, а формы остаются при своём ярлыке", () => {
    assert.deepEqual(removeFolder(["Работа", "Чтение"], "Работа"), ["Чтение"]);
    // Формы носят ярлык сами, поэтому непустая папка вернётся в список.
    assert.deepEqual(folderNames(forms, removeFolder(["Чтение"], "Чтение")), [
        "Работа",
        "Чтение",
    ]);
});
