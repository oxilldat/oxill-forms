import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDateTime, resolveDateTokens } from "./dates";

// 28 марта 2026, 23:21:35 — тот самый штамп из четырнадцати цифр.
const moment = new Date(2026, 2, 28, 23, 21, 35);

test("формат собирается из букв", () => {
    assert.equal(formatDateTime(moment, "YYYYMMDDHHmmss"), "20260328232135");
    assert.equal(formatDateTime(moment, "YYYY-MM-DD"), "2026-03-28");
    assert.equal(formatDateTime(moment, "HH:mm"), "23:21");
    assert.equal(formatDateTime(moment, "YY"), "26");
});

test("однозначные числа дополняются нулём", () => {
    const early = new Date(2026, 0, 3, 9, 5, 7);
    assert.equal(formatDateTime(early, "YYYYMMDDHHmmss"), "20260103090507");
});

test("YYYY не распадается на два YY", () => {
    assert.equal(formatDateTime(moment, "YYYY"), "2026");
});

test("посторонние символы остаются как есть", () => {
    assert.equal(formatDateTime(moment, "Дневник/YYYY/MM"), "Дневник/2026/03");
    assert.equal(formatDateTime(moment, "год YYYY"), "год 2026");
});

test("год не подставляется повторно в собственный результат", () => {
    // 2026 содержит «02» и «26»; если бы результат просматривался заново,
    // из них получились бы месяц и год.
    assert.equal(formatDateTime(moment, "YYYY"), "2026");
});

test("подстановка даты в тексте", () => {
    assert.equal(resolveDateTokens("{{date:YYYYMMDDHHmmss}}", moment), "20260328232135");
    assert.equal(resolveDateTokens("{{ date : YYYY }}", moment), "2026");
    assert.equal(
        resolveDateTokens("Дневник/{{date:YYYY}}/{{date:MM}}", moment),
        "Дневник/2026/03",
    );
});

test("короткие записи остались прежними", () => {
    assert.equal(resolveDateTokens("{{today}}", moment), "2026-03-28");
    assert.equal(resolveDateTokens("{{ today }}", moment), "2026-03-28");
    assert.equal(resolveDateTokens("{{now}}", moment), "23:21");
    assert.equal(resolveDateTokens("{{datetime}}", moment), "2026-03-28T23:21");
});

test("несколько подстановок в одной строке", () => {
    assert.equal(
        resolveDateTokens("Встреча {{today}} в {{now}}", moment),
        "Встреча 2026-03-28 в 23:21",
    );
});

test("пустой формат и незнакомое слово остаются текстом", () => {
    // Молча выданная пустота спрятала бы опечатку, а в имени заметки её потом
    // не найти.
    assert.equal(resolveDateTokens("{{date:}}", moment), "{{date:}}");
    assert.equal(resolveDateTokens("{{tomorrow}}", moment), "{{tomorrow}}");
});
