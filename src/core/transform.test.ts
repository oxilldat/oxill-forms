import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTransform, flatten, isTransformName, toSlug, toSnake } from "./transform";

test("flatten склеивает массив запятой", () => {
    assert.equal(flatten("текст"), "текст");
    assert.equal(flatten(7), "7");
    assert.equal(flatten(true), "true");
    assert.equal(flatten(["а", "б"]), "а, б");
});

test("toSlug сохраняет кириллицу и убирает знаки", () => {
    assert.equal(toSlug("Война и мир"), "война-и-мир");
    assert.equal(toSlug("  Дюна!  "), "дюна");
    assert.equal(toSlug("Мастер   и Маргарита"), "мастер-и-маргарита");
    assert.equal(toSlug("a_b c"), "a-b-c");
});

test("toSnake отличается от toSlug только разделителем", () => {
    assert.equal(toSnake("Война и мир"), "война_и_мир");
    assert.equal(toSnake("a-b c"), "a_b_c");
});

test("преобразования применяются к каждому элементу массива", () => {
    // Иначе slug склеил бы список в одну строку и потерял границы значений.
    assert.equal(applyTransform("slug", ["Война и мир", "Дюна"]), "война-и-мир, дюна");
    assert.equal(applyTransform("capitalize", ["дюна", "солярис"]), "Дюна, Солярис");
});

test("link оборачивает значение, но не оборачивает дважды", () => {
    assert.equal(applyTransform("link", "Мария Сидорова"), "[[Мария Сидорова]]");
    // Поля image и file возвращают уже готовую ссылку.
    assert.equal(applyTransform("link", "[[Вложения/фото.png]]"), "[[Вложения/фото.png]]");
    assert.equal(applyTransform("link", ["Иван", "Ольга"]), "[[Иван]], [[Ольга]]");
});

test("list превращает значения в маркированный список", () => {
    assert.equal(applyTransform("list", ["а", "б"]), "- а\n- б");
    assert.equal(applyTransform("list", "одно"), "- одно");
});

test("upper и lower работают со всей строкой сразу", () => {
    assert.equal(applyTransform("upper", "дюна"), "ДЮНА");
    assert.equal(applyTransform("lower", "ДЮНА"), "дюна");
    assert.equal(applyTransform("trim", "  дюна  "), "дюна");
});

test("isTransformName отсекает опечатки", () => {
    assert.equal(isTransformName("upper"), true);
    assert.equal(isTransformName("uppercase"), false);
    assert.equal(isTransformName(""), false);
});
