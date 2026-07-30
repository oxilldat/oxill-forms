import assert from "node:assert/strict";
import { test } from "node:test";
import { bundleToJson, isNewerVersion, parseBundle } from "./exchange";
import type { FormDefinition } from "./types";

const form: FormDefinition = {
    name: "book",
    title: "Книга",
    version: 1,
    fields: [{ name: "title", input: { type: "text" } }],
};

test("экспорт кладёт формы в конверт с версией плагина", () => {
    const parsed: unknown = JSON.parse(bundleToJson([form], "0.1.0"));
    assert.deepEqual(parseBundle(parsed), { forms: [form], version: "0.1.0" });
});

test("импорт понимает конверт, голый массив и одну форму", () => {
    assert.equal(parseBundle({ forms: [form], version: "0.1.0" })?.forms.length, 1);
    assert.equal(parseBundle([form, { ...form, name: "meeting" }])?.forms.length, 2);
    assert.equal(parseBundle(form)?.forms.length, 1);
});

test("у голого JSON версии нет, и это не ошибка", () => {
    assert.equal(parseBundle(form)?.version, undefined);
});

test("мусор не разбирается", () => {
    assert.equal(parseBundle(null), null);
    assert.equal(parseBundle("строка"), null);
    assert.equal(parseBundle({}), null);
    assert.equal(parseBundle([]), null);
    assert.equal(parseBundle({ forms: ["мусор"] }), null);
});

test("сравнение версий", () => {
    assert.equal(isNewerVersion("0.2.0", "0.1.0"), true);
    assert.equal(isNewerVersion("0.1.0", "0.2.0"), false);
    assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
    // Разная длина: 1.0 и 1.0.0 — одно и то же.
    assert.equal(isNewerVersion("1.0", "1.0.0"), false);
    assert.equal(isNewerVersion("1.0.1", "1.0"), true);
    // Числа сравниваются как числа, а не как строки.
    assert.equal(isNewerVersion("0.10.0", "0.9.0"), true);
});
