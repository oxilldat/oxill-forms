import assert from "node:assert/strict";
import { test } from "node:test";
import { folderPrefix, isInsideFolder } from "./paths";

test("корень хранилища даёт пустой префикс", () => {
    assert.equal(folderPrefix(""), "");
    assert.equal(folderPrefix("/"), "");
    assert.equal(folderPrefix(undefined), "");
    assert.equal(folderPrefix("  Проекты  "), "Проекты/");
    assert.equal(folderPrefix("/Проекты/"), "Проекты/");
});

test("внутри пустой папки лежит всё хранилище", () => {
    assert.equal(isInsideFolder("Проекты/2026", ""), true);
    assert.equal(isInsideFolder("Заметка", undefined), true);
});

test("соседняя папка с похожим именем внутрь не попадает", () => {
    // Без косой черты «Проекты 2026» оказались бы внутри «Проекты».
    assert.equal(isInsideFolder("Проекты/2026", "Проекты"), true);
    assert.equal(isInsideFolder("Проекты 2026/План", "Проекты"), false);
    assert.equal(isInsideFolder("Архив/Проекты", "Проекты"), false);
});

test("сама папка своим потомком не считается", () => {
    // Выбор «внутри Проектов» — про то, что лежит в них, а не про них самих.
    assert.equal(isInsideFolder("Проекты", "Проекты"), false);
});
