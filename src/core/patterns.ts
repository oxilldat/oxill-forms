import type { SelectOption } from "./types";

/**
 * Отбор подсказок по регулярному выражению. Пока это нужно одним тегам:
 * в хранилище их бывают сотни, и служебные забивают список так, что нужного
 * не найти.
 *
 * Кривое выражение считается отсутствующим фильтром, а не ошибкой формы:
 * заполнять её всё равно надо, а сказать про опечатку есть кому — редактор
 * поля проверяет выражение сразу при вводе.
 */

/** Разбирает выражение. `null` — выражения нет или оно не разбирается. */
export function compilePattern(pattern: string | undefined): RegExp | null {
    const source = pattern?.trim() ?? "";
    if (source === "") return null;

    try {
        return new RegExp(source);
    } catch {
        return null;
    }
}

/** Годится ли выражение. Нужно редактору поля, чтобы предупредить сразу. */
export function isValidPattern(pattern: string): boolean {
    if (pattern.trim() === "") return true;
    return compilePattern(pattern) !== null;
}

/**
 * Убирает варианты, подходящие под выражение. Сверяем значение, а не подпись:
 * подпись показывается человеку, а правило пишется про сам тег.
 */
export function excludeMatching(
    options: SelectOption[],
    pattern: string | undefined,
): SelectOption[] {
    const regexp = compilePattern(pattern);
    if (regexp === null) return options;
    return options.filter((option) => !regexp.test(option.value));
}
