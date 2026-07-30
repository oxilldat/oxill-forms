import assert from "node:assert/strict";
import { test } from "node:test";
import { freeNameFrom, isValidName, letterSuffix, stripToLatin } from "./naming";

test("isValidName принимает только латинские буквы", () => {
    assert.equal(isValidName("book"), true);
    assert.equal(isValidName("bookTwo"), true);
    assert.equal(isValidName(""), false);
    assert.equal(isValidName("книга"), false);
    assert.equal(isValidName("book2"), false);
    assert.equal(isValidName("my form"), false);
    assert.equal(isValidName("my-form"), false);
    assert.equal(isValidName("my_form"), false);
});

test("stripToLatin вычищает всё лишнее", () => {
    assert.equal(stripToLatin("book-2"), "book");
    assert.equal(stripToLatin("моя форма"), "");
    assert.equal(stripToLatin("a1b2c3"), "abc");
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
