import assert from "node:assert/strict";
import { test } from "node:test";
import { setLanguage } from "../i18n";
import { duplicateForm, findForm, freeName, isNameTaken, plural, removeForm, upsertForm } from "./forms";
import type { FormDefinition } from "./types";

// Сообщения переводятся, поэтому язык задаём явно: иначе проверки
// зависели бы от языка того, кто запускает тесты.
setLanguage("ru");

function form(name: string, title = name): FormDefinition {
    return { name, title, version: 1, fields: [] };
}

const forms = [form("book", "Книга"), form("meeting", "Встреча")];

test("findForm ищет по идентификатору", () => {
    assert.equal(findForm(forms, "book")?.title, "Книга");
    assert.equal(findForm(forms, "nosuch"), undefined);
});

test("isNameTaken не считает форму конфликтом с собой", () => {
    assert.equal(isNameTaken(forms, "book"), true);
    assert.equal(isNameTaken(forms, "book", "book"), false);
    assert.equal(isNameTaken(forms, "other"), false);
});

test("freeName подбирает свободное имя буквами", () => {
    assert.equal(freeName(forms, "other"), "other");
    assert.equal(freeName(forms, "book"), "bookA");
});

test("upsertForm добавляет новую форму", () => {
    const result = upsertForm(forms, form("note", "Заметка"));
    assert.equal(result.length, 3);
});

test("upsertForm при переименовании правит форму, а не создаёт дубль", () => {
    // Без originalName переименование добавляло бы вторую форму вместо
    // правки первой — ошибка тихая, поэтому и проверяется отдельно.
    const renamed: FormDefinition = { ...form("bookTwo", "Книга"), version: 1 };
    const result = upsertForm(forms, renamed, "book");
    assert.equal(result.length, 2);
    assert.deepEqual(
        result.map((f) => f.name),
        ["bookTwo", "meeting"],
    );
});

test("removeForm убирает форму по имени", () => {
    assert.deepEqual(
        removeForm(forms, "book").map((f) => f.name),
        ["meeting"],
    );
});

test("duplicateForm даёт латинское имя и человеческий заголовок", () => {
    const result = duplicateForm(forms, "book");
    const copy = result[result.length - 1];
    assert.equal(copy?.name, "bookCopy");
    assert.equal(copy?.title, "Книга (копия)");
});

test("повторное дублирование не конфликтует по имени", () => {
    const once = duplicateForm(forms, "book");
    const twice = duplicateForm(once, "book");
    assert.deepEqual(
        twice.map((f) => f.name),
        ["book", "meeting", "bookCopy", "bookCopyA"],
    );
});

test("дублирование несуществующей формы ничего не меняет", () => {
    assert.deepEqual(duplicateForm(forms, "nosuch"), forms);
});

test("склонение существительных при числительном", () => {
    const p = (n: number) => plural(n, "поле", "поля", "полей");
    assert.equal(p(0), "0 полей");
    assert.equal(p(1), "1 поле");
    assert.equal(p(2), "2 поля");
    assert.equal(p(5), "5 полей");
    // Одиннадцать — исключение, на нём наивное правило и ломается.
    assert.equal(p(11), "11 полей");
    assert.equal(p(14), "14 полей");
    assert.equal(p(21), "21 поле");
    assert.equal(p(22), "22 поля");
    assert.equal(p(101), "101 поле");
});
