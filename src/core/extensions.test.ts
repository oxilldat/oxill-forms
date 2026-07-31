import assert from "node:assert/strict";
import { test } from "node:test";
import {
    acceptAttribute,
    extensionOf,
    formatExtensions,
    isAllowedExtension,
    parseExtensions,
} from "./extensions";

test("расширение берётся после последней точки и в нижнем регистре", () => {
    assert.equal(extensionOf("Отчёт.PDF"), "pdf");
    assert.equal(extensionOf("архив.tar.gz"), "gz");
    assert.equal(extensionOf("без-точки"), "");
});

test("список расширений понимает запятые, точки и регистр", () => {
    assert.deepEqual(parseExtensions("jpg, .PNG; webp"), ["jpg", "png", "webp"]);
    assert.deepEqual(parseExtensions("pdf pdf .pdf"), ["pdf"]);
    assert.deepEqual(parseExtensions("   "), []);
});

test("список расширений читается и из массива в data.json", () => {
    assert.deepEqual(parseExtensions([".PDF", "docx", 7, ""]), ["pdf", "docx"]);
    assert.deepEqual(parseExtensions(undefined), []);
});

test("пустой список означает «любые»", () => {
    assert.equal(isAllowedExtension("что-угодно.exe", []), true);
    assert.equal(isAllowedExtension("Скан.PDF", ["pdf"]), true);
    assert.equal(isAllowedExtension("картинка.png", ["pdf", "docx"]), false);
    // Файл без расширения под ограничение не подходит: сверять не с чем.
    assert.equal(isAllowedExtension("readme", ["md"]), false);
});

test("строка для показа и атрибут accept собираются из одного списка", () => {
    assert.equal(formatExtensions(["pdf", "docx"]), "pdf, docx");
    assert.equal(acceptAttribute(["pdf", "docx"]), ".pdf,.docx");
    assert.equal(acceptAttribute([]), "");
});
