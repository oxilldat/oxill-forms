import assert from "node:assert/strict";
import { test } from "node:test";
import { conditionMet, conditionNeedsValue, conditionsFor } from "./conditions";

test("isSet считает пустым пустую строку и пустой список", () => {
    assert.equal(conditionMet({ field: "x", kind: "isSet" }, "текст"), true);
    assert.equal(conditionMet({ field: "x", kind: "isSet" }, 0), true);
    assert.equal(conditionMet({ field: "x", kind: "isSet" }, false), true);
    assert.equal(conditionMet({ field: "x", kind: "isSet" }, undefined), false);
    assert.equal(conditionMet({ field: "x", kind: "isSet" }, ""), false);
    assert.equal(conditionMet({ field: "x", kind: "isSet" }, []), false);
    assert.equal(conditionMet({ field: "x", kind: "isSet" }, ["а"]), true);
});

test("isTrue и isFalse срабатывают только на настоящих значениях переключателя", () => {
    assert.equal(conditionMet({ field: "x", kind: "isTrue" }, true), true);
    assert.equal(conditionMet({ field: "x", kind: "isTrue" }, "true"), false);
    assert.equal(conditionMet({ field: "x", kind: "isFalse" }, false), true);
    assert.equal(conditionMet({ field: "x", kind: "isFalse" }, undefined), false);
});

test("equals сравнивает как строки, а в списке ищет среди выбранного", () => {
    assert.equal(conditionMet({ field: "x", kind: "equals", value: "done" }, "done"), true);
    assert.equal(conditionMet({ field: "x", kind: "equals", value: "done" }, "reading"), false);
    assert.equal(conditionMet({ field: "x", kind: "equals", value: 5 }, 5), true);
    assert.equal(
        conditionMet({ field: "x", kind: "equals", value: "классика" }, ["классика", "детектив"]),
        true,
    );
});

test("contains работает и по подстроке, и по элементам списка", () => {
    assert.equal(conditionMet({ field: "x", kind: "contains", value: "мир" }, "Война и мир"), true);
    assert.equal(conditionMet({ field: "x", kind: "contains", value: "мир" }, "Дюна"), false);
    assert.equal(conditionMet({ field: "x", kind: "contains", value: "б" }, ["а", "б"]), true);
});

test("startsWith и endsWith", () => {
    assert.equal(conditionMet({ field: "x", kind: "startsWith", value: "Вой" }, "Война"), true);
    assert.equal(conditionMet({ field: "x", kind: "endsWith", value: "на" }, "Война"), true);
    assert.equal(conditionMet({ field: "x", kind: "endsWith", value: "на" }, "Мир"), false);
});

test("above и below сравнивают числа как числа", () => {
    assert.equal(conditionMet({ field: "x", kind: "above", value: 5 }, 7), true);
    assert.equal(conditionMet({ field: "x", kind: "above", value: 5 }, 5), false);
    assert.equal(conditionMet({ field: "x", kind: "below", value: 5 }, 3), true);
    // 10 больше 9, хотя как строка "10" меньше "9".
    assert.equal(conditionMet({ field: "x", kind: "above", value: 9 }, 10), true);
});

test("above и below работают с датами ISO как со строками", () => {
    const after = { field: "x", kind: "above", value: "2026-01-01" } as const;
    assert.equal(conditionMet(after, "2026-07-30"), true);
    assert.equal(conditionMet(after, "2025-12-31"), false);
});

test("above на незаполненном поле не срабатывает", () => {
    // Иначе пустое поле выглядело бы как «меньше любого числа».
    assert.equal(conditionMet({ field: "x", kind: "above", value: 5 }, undefined), false);
    assert.equal(conditionMet({ field: "x", kind: "below", value: 5 }, ""), false);
});

test("набор условий подбирается под тип поля", () => {
    assert.deepEqual(conditionsFor("toggle"), ["isTrue", "isFalse"]);
    assert.deepEqual(conditionsFor("image"), ["isSet"]);
    assert.deepEqual(conditionsFor("tag"), ["isSet", "contains"]);
    assert.ok(conditionsFor("text").includes("startsWith"));
    assert.ok(!conditionsFor("text").includes("isTrue"));
});

test("условиям без значения поле ввода не нужно", () => {
    assert.equal(conditionNeedsValue("isSet"), false);
    assert.equal(conditionNeedsValue("isTrue"), false);
    assert.equal(conditionNeedsValue("equals"), true);
});
