import assert from "node:assert/strict";
import { test } from "node:test";
import { asDataviewText, asListText, renderTemplate, selectFields } from "./format";
import type { FormData } from "./FormResult";

const data: FormData = {
    person: "Мария Сидорова",
    participants: ["Иван Петров", "Ольга Смирнова"],
    date: "2026-07-30",
    target: "Встречи",
    source: "шаблон Templater",
};

test("omit выбрасывает служебные поля", () => {
    const selected = selectFields(data, { omit: ["target", "source"] });
    assert.deepEqual(Object.keys(selected), ["person", "participants", "date"]);
});

test("pick оставляет только названные поля и сохраняет их порядок", () => {
    const selected = selectFields(data, { pick: ["date", "person"] });
    assert.deepEqual(Object.keys(selected), ["person", "date"]);
});

test("pick и omit вместе: omit применяется после pick", () => {
    const selected = selectFields(data, { pick: ["person", "target"], omit: ["target"] });
    assert.deepEqual(Object.keys(selected), ["person"]);
});

test("без настроек отбора возвращается всё", () => {
    assert.deepEqual(selectFields(data), data);
});

test("asDataviewText склеивает массивы запятой", () => {
    const text = asDataviewText(selectFields(data, { pick: ["person", "participants"] }));
    assert.equal(text, "person:: Мария Сидорова\nparticipants:: Иван Петров, Ольга Смирнова");
});

test("asListText выводит пары ключ-значение", () => {
    assert.equal(asListText({ a: 1, b: "два" }), "- a: 1\n- b: два");
});

test("renderTemplate подставляет значения и применяет преобразования", () => {
    assert.equal(renderTemplate("{{ person }}", data), "Мария Сидорова");
    assert.equal(renderTemplate("{{person}}", data), "Мария Сидорова");
    assert.equal(renderTemplate("{{ person | upper }}", data), "МАРИЯ СИДОРОВА");
    assert.equal(renderTemplate("{{ person | link }}", data), "[[Мария Сидорова]]");
});

test("renderTemplate оставляет нетронутым то, чего не понял", () => {
    // Опечатку в имени поля или преобразования видно в тексте заметки.
    assert.equal(renderTemplate("{{ nosuch }}", data), "{{ nosuch }}");
    assert.equal(renderTemplate("{{ person | nosuch }}", data), "{{ person | nosuch }}");
});

test("ноль и false выводятся, а не считаются пустотой", () => {
    // Классическая ловушка: проверка на «ложность» вместо проверки на undefined
    // молча съедала бы оценку 0 и выключенный переключатель.
    const withZero: FormData = { score: 0, favorite: false };
    assert.equal(renderTemplate("{{ score }} / {{ favorite }}", withZero), "0 / false");
    assert.equal(asDataviewText(withZero), "score:: 0\nfavorite:: false");
});

test("renderTemplate обрабатывает несколько подстановок в одной строке", () => {
    assert.equal(
        renderTemplate("{{ person }} — {{ date }}", data),
        "Мария Сидорова — 2026-07-30",
    );
});
