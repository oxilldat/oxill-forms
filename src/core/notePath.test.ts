import assert from "node:assert/strict";
import { test } from "node:test";
import { renderNoteFolder, renderNoteName } from "./notePath";
import type { FormData } from "./FormResult";

const data: FormData = {
    title: "Война и мир",
    author: "Лев Толстой",
    genre: "Роман",
    empty: "",
};

test("имя собирается из полей", () => {
    assert.equal(renderNoteName("{{author}} — {{title}}", data, "Книга"), "Лев Толстой — Война и мир");
});

test("незаполненное поле не оставляет висячих разделителей", () => {
    // Иначе получилось бы « — Война и мир» с тире в начале имени файла.
    assert.equal(renderNoteName("{{empty}} — {{title}}", data, "Книга"), "Война и мир");
    assert.equal(renderNoteName("{{title}} — {{empty}}", data, "Книга"), "Война и мир");
});

test("пустой шаблон и пустой результат дают запасное имя", () => {
    assert.equal(renderNoteName(undefined, data, "Книга"), "Книга");
    assert.equal(renderNoteName("   ", data, "Книга"), "Книга");
    assert.equal(renderNoteName("{{empty}}", data, "Книга"), "Книга");
    // Совсем без запасного имени заметка называлась бы пустой строкой.
    assert.equal(renderNoteName("{{empty}}", data, ""), "Без имени");
});

test("запрещённые в имени символы заменяются", () => {
    const risky: FormData = { title: 'а/б\\в:г*д?е"ж<з>и|к' };
    assert.equal(renderNoteName("{{title}}", risky, "x"), "а-б-в-г-д-е-ж-з-и-к");
});

test("неизвестная подстановка остаётся текстом и видна глазами", () => {
    // Правило то же, что в шаблоне заметки: опечатка не должна молча
    // превращаться в пустое место.
    assert.equal(renderNoteName("{{athor}}", data, "Книга"), "{{athor}}");
});

test("папка собирается из сегментов, пустые выбрасываются", () => {
    assert.equal(renderNoteFolder("Книги/{{genre}}", data), "Книги/Роман");
    assert.equal(renderNoteFolder("Книги/{{empty}}", data), "Книги");
    assert.equal(renderNoteFolder("{{empty}}/Книги", data), "Книги");
    assert.equal(renderNoteFolder("Книги//{{genre}}", data), "Книги/Роман");
});

test("пустой шаблон папки означает корень хранилища", () => {
    assert.equal(renderNoteFolder(undefined, data), "");
    assert.equal(renderNoteFolder("  ", data), "");
    assert.equal(renderNoteFolder("{{empty}}", data), "");
});

test("косая черта в пути остаётся разделителем, прочий мусор режется", () => {
    const risky: FormData = { genre: "Роман: часть 1" };
    assert.equal(renderNoteFolder("Книги/{{genre}}", risky), "Книги/Роман- часть 1");
});

test("выход из хранилища через точки невозможен", () => {
    assert.equal(renderNoteFolder("Книги/../../etc", data), "Книги/etc");
});
