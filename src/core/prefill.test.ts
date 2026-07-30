import assert from "node:assert/strict";
import { test } from "node:test";
import { valuesFromFrontmatter } from "./prefill";
import type { FieldDefinition, InputType } from "./types";

function field(name: string, input: InputType = { type: "text" }): FieldDefinition {
    return { name, input };
}

test("берутся только поля формы, остальная шапка не трогается", () => {
    const values = valuesFromFrontmatter([field("title"), field("author")], {
        title: "Дюна",
        author: "Фрэнк Герберт",
        cssclass: "book",
        aliases: ["Dune"],
    });
    assert.deepEqual(values, { title: "Дюна", author: "Фрэнк Герберт" });
});

test("отсутствующей шапки достаточно, чтобы ничего не подставить", () => {
    assert.deepEqual(valuesFromFrontmatter([field("title")], undefined), {});
    assert.deepEqual(valuesFromFrontmatter([field("title")], {}), {});
});

test("список приходит списком, а одиночное значение становится списком", () => {
    const fields = [field("genres", { type: "multiselect", source: "fixed", options: [] })];
    assert.deepEqual(valuesFromFrontmatter(fields, { genres: ["классика", "фантастика"] }), {
        genres: ["классика", "фантастика"],
    });
    assert.deepEqual(valuesFromFrontmatter(fields, { genres: "классика" }), {
        genres: ["классика"],
    });
});

test("числа приходят числами, мусор отбрасывается", () => {
    const fields = [field("mark", { type: "number" })];
    assert.deepEqual(valuesFromFrontmatter(fields, { mark: 9 }), { mark: 9 });
    assert.deepEqual(valuesFromFrontmatter(fields, { mark: "9" }), { mark: 9 });
    assert.deepEqual(valuesFromFrontmatter(fields, { mark: "девять" }), {});
});

test("переключатель понимает и булево, и текст", () => {
    const fields = [field("favorite", { type: "toggle" })];
    assert.deepEqual(valuesFromFrontmatter(fields, { favorite: true }), { favorite: true });
    assert.deepEqual(valuesFromFrontmatter(fields, { favorite: "true" }), { favorite: true });
    assert.deepEqual(valuesFromFrontmatter(fields, { favorite: "нет" }), { favorite: false });
});

test("дата из YAML приходит объектом Date и приводится к виду поля", () => {
    const fields = [field("finished", { type: "date" })];
    assert.deepEqual(valuesFromFrontmatter(fields, { finished: new Date("2026-03-14") }), {
        finished: "2026-03-14",
    });
});

test("пустое значение не подставляется — поле остаётся пустым", () => {
    assert.deepEqual(valuesFromFrontmatter([field("author")], { author: "" }), {});
    assert.deepEqual(valuesFromFrontmatter([field("author")], { author: null }), {});
});
