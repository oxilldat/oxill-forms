import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultValues, formatDate, formatTime, resolveTokens } from "./defaults";
import type { FieldDefinition, InputType } from "./types";

// Фиксированный момент времени: иначе тест зависел бы от часов машины.
const moment = new Date(2026, 6, 30, 9, 5);

function field(name: string, value: string, input: InputType = { type: "text" }): FieldDefinition {
    return { name, input, default: value };
}

test("дата и время выводятся с ведущими нулями", () => {
    assert.equal(formatDate(moment), "2026-07-30");
    assert.equal(formatTime(moment), "09:05");
    assert.equal(formatDate(new Date(2026, 0, 3)), "2026-01-03");
});

test("подстановки понимают пробелы внутри скобок", () => {
    assert.equal(resolveTokens("{{today}}", moment), "2026-07-30");
    assert.equal(resolveTokens("{{ today }}", moment), "2026-07-30");
    assert.equal(resolveTokens("{{now}}", moment), "09:05");
    assert.equal(resolveTokens("{{datetime}}", moment), "2026-07-30T09:05");
});

test("подстановка работает внутри текста и несколько раз", () => {
    assert.equal(
        resolveTokens("Встреча {{today}} в {{now}}", moment),
        "Встреча 2026-07-30 в 09:05",
    );
});

test("незнакомое остаётся как есть", () => {
    assert.equal(resolveTokens("{{tomorrow}}", moment), "{{tomorrow}}");
});

test("поля без значения по умолчанию пропускаются", () => {
    assert.deepEqual(defaultValues([{ name: "x", input: { type: "text" } }], moment), {});
    assert.deepEqual(defaultValues([field("x", "   ")], moment), {});
});

test("значение приводится к типу поля", () => {
    assert.deepEqual(defaultValues([field("n", "7", { type: "number" })], moment), { n: 7 });
    assert.deepEqual(defaultValues([field("t", "true", { type: "toggle" })], moment), { t: true });
    assert.deepEqual(defaultValues([field("t", "нет", { type: "toggle" })], moment), { t: false });
    assert.deepEqual(defaultValues([field("n", "текст", { type: "number" })], moment), {});
});

test("список по умолчанию перечисляется запятой", () => {
    const fields = [field("tags", "книги, классика", { type: "tag" })];
    assert.deepEqual(defaultValues(fields, moment), { tags: ["книги", "классика"] });
});

test("дата по умолчанию — сегодняшняя", () => {
    const fields = [field("finished", "{{today}}", { type: "date" })];
    assert.deepEqual(defaultValues(fields, moment), { finished: "2026-07-30" });
});
