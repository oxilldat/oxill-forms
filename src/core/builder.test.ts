import assert from "node:assert/strict";
import { test } from "node:test";
import { builder } from "./builder";

test("собранная форма — обычное определение формы", () => {
    const form = builder("book", "Новая книга")
        .text({ name: "title", label: "Название", required: true })
        .slider({ name: "rating", label: "Оценка", min: 1, max: 5 })
        .build();

    assert.deepEqual(form, {
        name: "book",
        title: "Новая книга",
        version: 1,
        fields: [
            { name: "title", label: "Название", required: true, input: { type: "text" } },
            {
                name: "rating",
                label: "Оценка",
                input: { type: "slider", min: 1, max: 5, step: 1 },
            },
        ],
    });
});

test("список значений принимается и строками, и парами", () => {
    const form = builder("book")
        .select({ name: "status", options: ["Читаю", "Прочитано"] })
        .multiselect({ name: "genre", options: [{ value: "sf", label: "Фантастика" }] })
        .build();

    assert.deepEqual(form.fields[0]?.input, {
        type: "select",
        source: "fixed",
        options: [
            { value: "Читаю", label: "Читаю" },
            { value: "Прочитано", label: "Прочитано" },
        ],
    });
    assert.deepEqual(form.fields[1]?.input, {
        type: "multiselect",
        source: "fixed",
        options: [{ value: "sf", label: "Фантастика" }],
    });
});

test("источник множественного выбора определяется тем, что передали", () => {
    const notes = builder("a").multiselect({ name: "x", folder: "Люди", folders: ["Команда"] });
    assert.deepEqual(notes.build().fields[0]?.input, {
        type: "multiselect",
        source: "notes",
        folder: "Люди",
        folders: ["Команда"],
    });

    const query = builder("a").multiselect({ name: "x", query: "dv.pages()" });
    assert.deepEqual(query.build().fields[0]?.input, {
        type: "multiselect",
        source: "dataview",
        query: "dv.pages()",
    });
});

test("заголовку раздела идентификатор придумывать не нужно", () => {
    const form = builder("a").text({ name: "title" }).section({ label: "Оценка" }).build();
    assert.equal(form.fields[1]?.input.type, "section");
    assert.equal(form.fields[1]?.label, "Оценка");
    assert.equal(typeof form.fields[1]?.name, "string");
    assert.notEqual(form.fields[1]?.name, "");
});

test("пустой заголовок формы заменяется идентификатором", () => {
    assert.equal(builder("book").build().title, "book");
});

test("негодная форма падает с исключением, а не открывается наполовину", () => {
    // Форма собрана кодом, и сказать об ошибке некому, кроме того, кто её
    // пишет: молча открыть окно без половины полей было бы хуже.
    assert.throws(
        () => builder("a").text({ name: "title" }).text({ name: "title" }).build(),
        /title/,
    );
    assert.throws(() => builder("a").text({ name: "" }).build());
});

test("шаблон заметки задаётся тем же построителем", () => {
    const form = builder("a").text({ name: "title" }).template("# {{ title }}").build();
    assert.equal(form.template, "# {{ title }}");
});
