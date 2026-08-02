import assert from "node:assert/strict";
import { test } from "node:test";
import { freeNameFrom, isValidName, letterSuffix, stripToName } from "./naming";

test("isValidName принимает латиницу, цифры и подчёркивание", () => {
    assert.equal(isValidName("book"), true);
    assert.equal(isValidName("bookTwo"), true);
    assert.equal(isValidName("book2"), true);
    assert.equal(isValidName("date_created"), true);
    assert.equal(isValidName("a_1"), true);
});

test("isValidName требует букву первой", () => {
    // Идентификатор становится и переменной, и ключом YAML: с цифры нельзя
    // ни там, ни там.
    assert.equal(isValidName("2date"), false);
    assert.equal(isValidName("_date"), false);
    assert.equal(isValidName(""), false);
    assert.equal(isValidName("книга"), false);
    assert.equal(isValidName("my form"), false);
    assert.equal(isValidName("my-form"), false);
});

test("stripToName вычищает лишнее и снимает цифры в начале", () => {
    assert.equal(stripToName("book-2"), "book2");
    assert.equal(stripToName("date created"), "datecreated");
    assert.equal(stripToName("date_created"), "date_created");
    assert.equal(stripToName("моя форма"), "");
    assert.equal(stripToName("2date"), "date");
    assert.equal(stripToName("_date"), "date");
});

test("letterSuffix нумерует буквами, а не цифрами", () => {
    assert.equal(letterSuffix(1), "A");
    assert.equal(letterSuffix(2), "B");
    // Границы алфавита — то место, где такой счётчик обычно и ломается.
    assert.equal(letterSuffix(26), "Z");
    assert.equal(letterSuffix(27), "AA");
    assert.equal(letterSuffix(28), "AB");
    assert.equal(letterSuffix(52), "AZ");
    assert.equal(letterSuffix(53), "BA");
});

test("freeNameFrom возвращает исходное имя, если оно свободно", () => {
    assert.equal(freeNameFrom(() => false, "book"), "book");
});

test("freeNameFrom добавляет буквенный суффикс к занятому имени", () => {
    const taken = new Set(["book", "bookA", "bookB"]);
    assert.equal(
        freeNameFrom((name) => taken.has(name), "book"),
        "bookC",
    );
});
