import assert from "node:assert/strict";
import { test } from "node:test";
import { setLanguage } from "../i18n";
import { checkRules, checkValue, hasRules, rulesFor } from "./rules";
import type { FieldDefinition, FieldRules, InputType } from "./types";

// Сообщения переводятся, поэтому язык задаём явно: иначе проверки
// зависели бы от языка того, кто запускает тесты.
setLanguage("ru");

function field(input: InputType, rules?: FieldRules): FieldDefinition {
    return rules === undefined ? { name: "x", input } : { name: "x", input, rules };
}

test("пустой ответ проверками не трогается", () => {
    // За «ответ вообще есть» отвечает обязательность, и удваивать её сообщение
    // не нужно.
    const number = field({ type: "number" }, { min: 5 });
    assert.equal(checkValue(number, undefined), null);
    assert.equal(checkValue(number, ""), null);
    assert.equal(checkValue(field({ type: "tag" }, { minLength: 2 }), []), null);
});

test("границы числа", () => {
    const rated = field({ type: "number" }, { min: 1, max: 5 });
    assert.equal(checkValue(rated, 3), null);
    assert.equal(checkValue(rated, 0), "Не меньше 1");
    assert.equal(checkValue(rated, 6), "Не больше 5");
    // Число могло прийти строкой из поля ввода, в том числе с запятой.
    assert.equal(checkValue(rated, "4,5"), null);
    assert.equal(checkValue(rated, "ерунда"), "Нужно число");
});

test("длина текста считается по обрезанному значению", () => {
    const note = field({ type: "text" }, { minLength: 3, maxLength: 5 });
    assert.equal(checkValue(note, "абв"), null);
    assert.equal(checkValue(note, "  аб  "), "Не короче 3 символов");
    assert.equal(checkValue(note, "абвгде"), "Не длиннее 5 символов");
});

test("количество значений у мультивыбора и тегов", () => {
    const topics = field({ type: "tag" }, { minLength: 2, maxLength: 3 });
    assert.equal(checkValue(topics, ["a", "b"]), null);
    assert.equal(checkValue(topics, ["a"]), "Выберите хотя бы 2 значения");
    assert.equal(checkValue(topics, ["a", "b", "c", "d"]), "Не больше 3 значений");
});

test("склонение в сообщениях", () => {
    assert.equal(
        checkValue(field({ type: "tag" }, { minLength: 1 }), []),
        null,
    );
    assert.equal(
        checkValue(field({ type: "tag" }, { minLength: 5 }), ["a"]),
        "Выберите хотя бы 5 значений",
    );
    assert.equal(
        checkValue(field({ type: "text" }, { minLength: 1 }), ""),
        null,
    );
});

test("регулярное выражение для текста", () => {
    const year = field({ type: "text" }, { pattern: "^\\d{4}$" });
    assert.equal(checkValue(year, "2026"), null);
    assert.equal(checkValue(year, "26"), "Значение не подходит под заданное правило");
});

test("кривое выражение не мешает заполнить форму", () => {
    // Про опечатку скажет редактор поля; заполняющий тут ни при чём.
    const broken = field({ type: "text" }, { pattern: "([)" });
    assert.equal(checkValue(broken, "что угодно"), null);
});

test("своё сообщение перекрывает сгенерированное", () => {
    const year = field({ type: "text" }, { pattern: "^\\d{4}$", message: "Год из четырёх цифр" });
    assert.equal(checkValue(year, "26"), "Год из четырёх цифр");

    const rated = field({ type: "number" }, { min: 1, message: "Оценка от единицы" });
    assert.equal(checkValue(rated, 0), "Оценка от единицы");
});

test("почта и телефон проверяются по типу, без настроек", () => {
    assert.equal(checkValue(field({ type: "email" }), "kot@example.com"), null);
    assert.equal(checkValue(field({ type: "email" }), "kot@example"), "Похоже, это не адрес почты");
    assert.equal(checkValue(field({ type: "tel" }), "+7 (999) 123-45-67"), null);
    assert.equal(checkValue(field({ type: "tel" }), "позвоните мне"), "Похоже, это не номер телефона");
});

test("набор правил зависит от типа поля", () => {
    assert.deepEqual(rulesFor("number"), ["min", "max", "message"]);
    assert.deepEqual(rulesFor("text"), ["minLength", "maxLength", "pattern", "message"]);
    assert.deepEqual(rulesFor("multiselect"), ["minLength", "maxLength", "message"]);
    // У переключателя, даты и выбора из списка проверять нечего.
    assert.equal(hasRules("toggle"), false);
    assert.equal(hasRules("date"), false);
    assert.equal(hasRules("select"), false);
});

test("бессмысленные правила ловятся у автора формы", () => {
    assert.equal(checkRules(undefined), null);
    assert.equal(checkRules({ min: 1, max: 5 }), null);
    assert.equal(checkRules({ min: 5, max: 1 }), "Минимум больше максимума");
    assert.equal(checkRules({ minLength: 5, maxLength: 1 }), "Наименьшая длина больше наибольшей");
    assert.equal(checkRules({ minLength: -1 }), "Длина не бывает отрицательной");
    assert.equal(checkRules({ pattern: "([)" }), "Выражение не разбирается");
});
