import { t } from "../i18n";
import { freeNameFrom } from "./naming";
import type { FormDefinition } from "./types";

/**
 * Операции над списком форм. Все функции чистые и возвращают новый массив —
 * так их можно тестировать без Obsidian и без плагина.
 */

export function findForm(forms: FormDefinition[], name: string): FormDefinition | undefined {
    return forms.find((form) => form.name === name);
}

/**
 * Занято ли имя. `exceptName` нужен при переименовании: форма не должна
 * конфликтовать сама с собой.
 */
export function isNameTaken(forms: FormDefinition[], name: string, exceptName?: string): boolean {
    return forms.some((form) => form.name === name && form.name !== exceptName);
}

/** Подбирает свободное имя вида «nameA», «nameB». */
export function freeName(forms: FormDefinition[], base: string): string {
    return freeNameFrom((candidate) => isNameTaken(forms, candidate), base);
}

/**
 * Добавляет форму или заменяет существующую. `originalName` указывает, какую
 * именно форму заменяем: без него переименование создало бы дубль вместо
 * правки — ошибка неочевидная и обнаруживается не сразу.
 */
export function upsertForm(
    forms: FormDefinition[],
    form: FormDefinition,
    originalName?: string,
): FormDefinition[] {
    const target = originalName ?? form.name;
    const exists = forms.some((f) => f.name === target);
    if (!exists) return [...forms, form];
    return forms.map((f) => (f.name === target ? form : f));
}

export function removeForm(forms: FormDefinition[], name: string): FormDefinition[] {
    return forms.filter((form) => form.name !== name);
}

export function duplicateForm(forms: FormDefinition[], name: string): FormDefinition[] {
    const source = findForm(forms, name);
    if (!source) return forms;
    const copy: FormDefinition = {
        ...structuredClone(source),
        // Заголовок свободный, а имя обязано остаться латиницей.
        name: freeName(forms, `${source.name}Copy`),
        title: t("note.copySuffix", { title: source.title }),
    };
    return [...forms, copy];
}

/** Склонение существительного при числительном: 1 поле, 2 поля, 5 полей. */
export function plural(count: number, one: string, few: string, many: string): string {
    const mod100 = count % 100;
    if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`;
    switch (count % 10) {
        case 1:
            return `${count} ${one}`;
        case 2:
        case 3:
        case 4:
            return `${count} ${few}`;
        default:
            return `${count} ${many}`;
    }
}
