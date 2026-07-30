import assert from "node:assert/strict";
import { test } from "node:test";
import { sectionOwners } from "./sections";
import type { FieldDefinition } from "./types";

function field(name: string): FieldDefinition {
    return { name, input: { type: "text" } };
}

function section(name: string): FieldDefinition {
    return { name, input: { type: "section" } };
}

test("поле принадлежит последнему разделу выше него", () => {
    const owners = sectionOwners([
        section("about"),
        field("title"),
        field("author"),
        section("rating"),
        field("mark"),
    ]);

    assert.equal(owners.get("title")?.name, "about");
    assert.equal(owners.get("author")?.name, "about");
    assert.equal(owners.get("mark")?.name, "rating");
});

test("поля до первого раздела ничему не принадлежат", () => {
    const owners = sectionOwners([field("title"), section("rating"), field("mark")]);
    assert.equal(owners.get("title"), undefined);
    assert.equal(owners.get("mark")?.name, "rating");
});

test("сами разделы в карту не попадают", () => {
    const owners = sectionOwners([section("about"), section("rating"), field("mark")]);
    assert.equal(owners.has("about"), false);
    assert.equal(owners.has("rating"), false);
    // Пустой раздел просто сменяется следующим.
    assert.equal(owners.get("mark")?.name, "rating");
});

test("форма без разделов даёт пустую карту", () => {
    assert.equal(sectionOwners([field("a"), field("b")]).size, 0);
    assert.equal(sectionOwners([]).size, 0);
});
