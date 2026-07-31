import assert from "node:assert/strict";
import { test } from "node:test";
import {
    defaultSettings,
    formCodeFields,
    parseFormDefinition,
    parseSettings,
} from "./settings";

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

test("вложения читают свою папку, шаблон имени и расширения", () => {
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        fields: [
            {
                name: "cover",
                input: {
                    type: "image",
                    folder: " Обложки ",
                    filenameTemplate: " {{title}} ",
                },
            },
            {
                name: "scan",
                input: { type: "file", extensions: [".PDF", "djvu", "pdf"] },
            },
        ],
    });

    assert.deepEqual(form?.fields[0]?.input, {
        type: "image",
        folder: "Обложки",
        filenameTemplate: "{{title}}",
    });
    assert.deepEqual(form?.fields[1]?.input, {
        type: "file",
        extensions: ["pdf", "djvu"],
    });
});

test("пустая папка и пустой шаблон у вложения не сохраняются", () => {
    // Отсутствие ключа означает «как в настройках плагина», а пустая строка
    // читалась бы как корень хранилища — это разные вещи.
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        fields: [{ name: "scan", input: { type: "file", folder: "  ", filenameTemplate: "" } }],
    });
    assert.deepEqual(form?.fields[0]?.input, { type: "file" });
});

test("множественный выбор заметок читает дополнительные папки", () => {
    const form = parseFormDefinition({
        name: "meeting",
        title: "Встреча",
        fields: [
            {
                name: "people",
                input: {
                    type: "multiselect",
                    source: "notes",
                    folder: "Люди",
                    folders: ["Команда", " Люди ", "Команда", ""],
                },
            },
        ],
    });

    // Повтор основной папки и повтор внутри списка отбрасываются: иначе
    // каждая заметка попала бы в список выбора дважды.
    assert.deepEqual(form?.fields[0]?.input, {
        type: "multiselect",
        source: "notes",
        folder: "Люди",
        folders: ["Команда"],
    });
});

test("одиночный выбор заметок дополнительных папок не заводит", () => {
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        fields: [
            {
                name: "author",
                input: { type: "select", source: "notes", folder: "Люди", folders: ["Команда"] },
            },
        ],
    });
    assert.deepEqual(form?.fields[0]?.input, { type: "select", source: "notes", folder: "Люди" });
});

test("простые типы читаются как есть, а не проваливаются в соседнюю ветку", () => {
    // Регрессия: у тега появились свои настройки, и типы без настроек
    // какое-то время доставались из разбора тегом.
    const simple = ["text", "textarea", "email", "tel", "number", "toggle", "date", "time"];
    for (const type of simple) {
        const form = parseFormDefinition({
            name: "book",
            title: "Книга",
            fields: [{ name: "value", input: { type } }],
        });
        assert.deepEqual(form?.fields[0]?.input, { type });
    }
});

test("у тега сохраняется выражение отбора, у папки — родитель", () => {
    const form = parseFormDefinition({
        name: "book",
        title: "Книга",
        fields: [
            { name: "tags", input: { type: "tag", exclude: " ^archive/ " } },
            { name: "where", input: { type: "folder", parent: "Проекты" } },
            { name: "plain", input: { type: "tag", exclude: "  " } },
        ],
    });

    assert.deepEqual(form?.fields[0]?.input, { type: "tag", exclude: "^archive/" });
    assert.deepEqual(form?.fields[1]?.input, { type: "folder", parent: "Проекты" });
    assert.deepEqual(form?.fields[2]?.input, { type: "tag" });
});

test("запрос источником бывает только у множественного выбора", () => {
    const multi = parseFormDefinition({
        name: "a",
        title: "a",
        fields: [
            { name: "x", input: { type: "multiselect", source: "dataview", query: "dv.pages()" } },
        ],
    });
    assert.deepEqual(multi?.fields[0]?.input, {
        type: "multiselect",
        source: "dataview",
        query: "dv.pages()",
    });

    // У одиночного выбора такого источника нет: для запроса есть свой тип.
    const single = parseFormDefinition({
        name: "a",
        title: "a",
        fields: [
            { name: "x", input: { type: "select", source: "dataview", query: "dv.pages()" } },
        ],
    });
    assert.deepEqual(single?.fields[0]?.input, { type: "select", source: "fixed", options: [] });
});

test("запрос множественного выбора попадает в предупреждение при импорте", () => {
    const form = parseFormDefinition({
        name: "a",
        title: "a",
        fields: [
            {
                name: "people",
                label: "Участники",
                input: { type: "multiselect", source: "dataview", query: "dv.pages()" },
            },
        ],
    });
    assert.deepEqual(formCodeFields(form!), [{ field: "Участники", query: "dv.pages()" }]);
});

test("негодное имя глобальной переменной заменяется привычным", () => {
    assert.equal(parseSettings({ globalName: "Forms" }).globalName, "Forms");
    assert.equal(parseSettings({ globalName: "$mf_2" }).globalName, "$mf_2");
    // С цифры, с дефисом и пустое — не имена переменных.
    assert.equal(parseSettings({ globalName: "2mf" }).globalName, "MFL");
    assert.equal(parseSettings({ globalName: "modal-forms" }).globalName, "MFL");
    assert.equal(parseSettings({ globalName: "" }).globalName, "MFL");
});

test("язык читается только из известных словарей", () => {
    assert.equal(parseSettings({ language: "de" }).language, "de");
    assert.equal(parseSettings({ language: "zh" }).language, "zh");
    // Языка, которого у нас нет, и мусора быть не должно: подставляем
    // английский — он есть всегда.
    assert.equal(parseSettings({ language: "it" }).language, "en");
    assert.equal(parseSettings({ language: "auto" }).language, "en");
    assert.equal(parseSettings({ language: 7 }).language, "en");
    // Отсутствие значения — это первая установка: настоящий язык подберёт
    // плагин при запуске, разбор про Obsidian ничего не знает.
    assert.equal(parseSettings({}).language, "en");
});
