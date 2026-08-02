import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultValues } from "./defaults";
import type { FieldDefinition, InputType } from "./types";

// Фиксированный момент времени: иначе тест зависел бы от часов машины.
const moment = new Date(2026, 6, 30, 9, 5);

function field(name: string, value: string, input: InputType = { type: "text" }): FieldDefinition {
    return { name, input, default: value };
}

// Сами подстановки времени проверяются в dates.test.ts; здесь важно только,
// что значение по умолчанию через них проходит.
test("значение по умолчанию понимает подстановки времени", () => {
    assert.deepEqual(defaultValues([field("d", "{{today}}")], moment), { d: "2026-07-30" });
    assert.deepEqual(defaultValues([field("d", "{{date:YYYY}}")], moment), { d: "2026" });
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
