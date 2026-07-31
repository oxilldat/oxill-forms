import assert from "node:assert/strict";
import { test } from "node:test";
import { compilePattern, excludeMatching, isValidPattern } from "./patterns";
import type { SelectOption } from "./types";

const tags: SelectOption[] = [
    { value: "книга", label: "книга" },
    { value: "archive/2024", label: "archive/2024" },
    { value: "archive/2025", label: "archive/2025" },
    { value: "работа", label: "работа" },
];

test("выражение отсекает ветку тегов целиком", () => {
    assert.deepEqual(
        excludeMatching(tags, "^archive/").map((tag) => tag.value),
        ["книга", "работа"],
    );
});

test("без выражения список не меняется", () => {
    assert.deepEqual(excludeMatching(tags, undefined), tags);
    assert.deepEqual(excludeMatching(tags, "   "), tags);
});

test("кривое выражение равносильно его отсутствию", () => {
    // Уронить заполнение формы из-за опечатки в настройке нельзя: про
    // опечатку скажет редактор поля, а форму надо заполнять.
    assert.equal(compilePattern("([)"), null);
    assert.deepEqual(excludeMatching(tags, "([)"), tags);
});

test("годность выражения проверяется отдельно — для подсказки в редакторе", () => {
    assert.equal(isValidPattern(""), true);
    assert.equal(isValidPattern("^archive/"), true);
    assert.equal(isValidPattern("([)"), false);
});

test("отбор идёт по значению тега, а не по его подписи", () => {
    const options: SelectOption[] = [{ value: "archive/2024", label: "Архив 2024" }];
    assert.deepEqual(excludeMatching(options, "^archive/"), []);
    assert.deepEqual(excludeMatching(options, "^Архив"), options);
});
