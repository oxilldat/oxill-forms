import assert from "node:assert/strict";
import { test } from "node:test";
import { createField, defaultInputFor, moveField, removeFieldAt, validateField } from "./fields";
import type { FieldDefinition } from "./types";

function field(name: string, extra: Partial<FieldDefinition> = {}): FieldDefinition {
    return { name, input: { type: "text" }, ...extra };
}

test("новое поле получает свободное имя", () => {
    assert.equal(createField([]).name, "field");
    assert.equal(createField([field("field")]).name, "fieldA");
    assert.equal(createField([field("field"), field("fieldA")]).name, "fieldB");
});

test("defaultInputFor даёт рабочие настройки, а не заготовку", () => {
    assert.deepEqual(defaultInputFor("slider"), { type: "slider", min: 0, max: 10, step: 1 });
    assert.deepEqual(defaultInputFor("select"), { type: "select", source: "fixed", options: [] });
    assert.deepEqual(defaultInputFor("note"), { type: "note", folder: "" });
    assert.deepEqual(defaultInputFor("text"), { type: "text" });
});

test("moveField переставляет поля и игнорирует выход за границы", () => {
    const fields = [field("a"), field("b"), field("c")];
    assert.deepEqual(
        moveField(fields, 0, 1).map((f) => f.name),
        ["b", "a", "c"],
    );
    assert.deepEqual(
        moveField(fields, 2, -1).map((f) => f.name),
        ["a", "c", "b"],
    );
    // Первое поле выше не поднимается, последнее ниже не опускается.
    assert.deepEqual(moveField(fields, 0, -1), fields);
    assert.deepEqual(moveField(fields, 2, 1), fields);
});

test("removeFieldAt убирает ровно одно поле", () => {
    const fields = [field("a"), field("b")];
    assert.deepEqual(
        removeFieldAt(fields, 0).map((f) => f.name),
        ["b"],
    );
});

test("проверка идентификатора поля", () => {
    assert.equal(validateField(field("author"), []), null);
    assert.ok(validateField(field(""), []));
    assert.ok(validateField(field("автор"), []));
    assert.ok(validateField(field("author2"), []));
});

test("дубликат имени внутри формы не проходит", () => {
    assert.ok(validateField(field("author"), [field("author")]));
});

test("скрытое поле не может быть обязательным", () => {
    // Заполнить невидимое поле пользователь не сможет — форма стала бы
    // неотправляемой без всякого объяснения.
    assert.ok(validateField(field("x", { hidden: true, required: true }), []));
    assert.equal(validateField(field("x", { hidden: true }), []), null);
});

test("условие показа обязано ссылаться на существующее поле", () => {
    const dependency = field("status");
    const dependent = field("score", {
        condition: { field: "status", kind: "isSet" },
    });
    assert.equal(validateField(dependent, [dependency]), null);
    assert.ok(validateField(dependent, []));
});

test("поле не может зависеть от себя", () => {
    const self = field("score", { condition: { field: "score", kind: "isSet" } });
    assert.ok(validateField(self, []));
});

test("выбор без вариантов и без папки не проходит", () => {
    assert.ok(
        validateField(field("x", { input: { type: "select", source: "fixed", options: [] } }), []),
    );
    assert.ok(
        validateField(field("x", { input: { type: "select", source: "notes", folder: " " } }), []),
    );
    assert.ok(validateField(field("x", { input: { type: "note", folder: "" } }), []));
    assert.ok(validateField(field("x", { input: { type: "dataview", query: "" } }), []));
});

test("границы ползунка проверяются", () => {
    const slider = (min: number, max: number, step: number) =>
        validateField(field("x", { input: { type: "slider", min, max, step } }), []);

    assert.equal(slider(0, 10, 1), null);
    assert.ok(slider(10, 10, 1), "минимум равен максимуму");
    assert.ok(slider(10, 0, 1), "минимум больше максимума");
    assert.ok(slider(0, 10, 0), "нулевой шаг");
    assert.ok(slider(0, 10, 50), "шаг больше диапазона");
});
