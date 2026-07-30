import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSettings, parseFormDefinition, parseSettings } from "./settings";

test("мусор вместо настроек даёт значения по умолчанию", () => {
    assert.deepEqual(parseSettings(null), defaultSettings());
    assert.deepEqual(parseSettings("строка"), defaultSettings());
    assert.deepEqual(parseSettings({}), defaultSettings());
});

test("по умолчанию всё, что трогает чужое, выключено", () => {
    const settings = defaultSettings();
    assert.equal(settings.skipDiscardConfirm, false, "подтверждение спрашивается");
    assert.equal(settings.dataviewEnabled, false, "чужой код не исполняется");
    assert.equal(settings.autoUpdateNotes, false, "чужие заметки сами не правятся");
    assert.equal(settings.imageFolder, "");
});

test("автоправка заметок включается только явным true", () => {
    assert.equal(parseSettings({ forms: [] }).autoUpdateNotes, false);
    assert.equal(parseSettings({ forms: [], autoUpdateNotes: true }).autoUpdateNotes, true);
});

test("форма без версии читается как первая", () => {
    const parsed = parseSettings({
        forms: [{ name: "book", title: "Книга", fields: [] }],
    });
    assert.equal(parsed.forms.length, 1);
    assert.equal(parsed.forms[0]?.version, 1);
});

test("формы без имени отбрасываются, дубликаты имён тоже", () => {
    const parsed = parseSettings({
        forms: [
            { name: "book", title: "Книга", fields: [] },
            { name: "", title: "Безымянная", fields: [] },
            { name: "book", title: "Дубль", fields: [] },
            "мусор",
        ],
    });
    assert.deepEqual(
        parsed.forms.map((form) => form.title),
        ["Книга"],
    );
});

test("пустой заголовок подменяется идентификатором", () => {
    const parsed = parseSettings({ forms: [{ name: "book", title: "  ", fields: [] }] });
    assert.equal(parsed.forms[0]?.title, "book");
});

test("старое command: true читается как вставка свойствами", () => {
    const parsed = parseSettings({
        forms: [{ name: "book", title: "Книга", command: true, fields: [] }],
    });
    assert.deepEqual(parsed.forms[0]?.command, {
        enabled: true,
        mode: "insert",
        format: "dataview",
    });
});

test("select без source читается как заданный список", () => {
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        fields: [
            {
                name: "status",
                input: { type: "select", options: [{ value: "done", label: "Прочитана" }] },
            },
        ],
    });
    const input = form?.fields[0]?.input;
    assert.equal(input?.type, "select");
    assert.equal(input?.type === "select" ? input.source : "", "fixed");
});

test("варианты выбора без подписи получают подписью своё значение", () => {
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        fields: [
            {
                name: "status",
                input: { type: "select", source: "fixed", options: [{ value: "done" }] },
            },
        ],
    });
    const input = form?.fields[0]?.input;
    assert.deepEqual(
        input?.type === "select" && input.source === "fixed" ? input.options : [],
        [{ value: "done", label: "done" }],
    );
});

test("поле с неизвестным типом отбрасывается, остальные остаются", () => {
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        fields: [
            { name: "title", input: { type: "text" } },
            { name: "weird", input: { type: "квантовое" } },
            { name: "title", input: { type: "text" } },
        ],
    });
    assert.deepEqual(form?.fields.map((field) => field.name), ["title"]);
});

test("ползунок без чисел получает разумные значения", () => {
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        fields: [{ name: "score", input: { type: "slider", step: 0 } }],
    });
    const input = form?.fields[0]?.input;
    assert.deepEqual(input, { type: "slider", min: 0, max: 10, step: 1 });
});

test("история переименований чистится от пустого и бессмысленного", () => {
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        version: 3,
        fields: [],
        renames: [
            { version: 2, from: "rating", to: "score" },
            { version: 3, from: "same", to: "same" },
            { from: "", to: "x" },
            "мусор",
        ],
    });
    assert.deepEqual(form?.renames, [{ version: 2, from: "rating", to: "score" }]);
});

test("условие с неизвестным видом не сохраняется", () => {
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        fields: [
            {
                name: "score",
                input: { type: "number" },
                condition: { field: "status", kind: "телепатия" },
            },
        ],
    });
    assert.equal(form?.fields[0]?.condition, undefined);
});
