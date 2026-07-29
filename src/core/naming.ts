/**
 * Правила именования. Идентификаторы форм и полей попадают в пользовательский
 * код (`openForm("book")`, `{{ author }}`), поэтому набор символов намеренно
 * узкий: только латинские буквы, без цифр и разделителей.
 */

export const NAME_PATTERN = /^[A-Za-z]+$/;

export function isValidName(name: string): boolean {
    return NAME_PATTERN.test(name);
}

/** Вычищает из строки всё, что не является латинской буквой. */
export function stripToLatin(value: string): string {
    return value.replace(/[^A-Za-z]/g, "");
}

/**
 * Суффикс-счётчик из букв: 1 → A, 2 → B, 26 → Z, 27 → AA.
 * Цифры использовать нельзя, поэтому нумеруем алфавитом.
 */
export function letterSuffix(index: number): string {
    let rest = index;
    let suffix = "";
    while (rest > 0) {
        const remainder = (rest - 1) % 26;
        suffix = String.fromCharCode(65 + remainder) + suffix;
        rest = Math.floor((rest - 1) / 26);
    }
    return suffix;
}

/** Подбирает свободное имя вида «base», «baseA», «baseB». */
export function freeNameFrom(isTaken: (name: string) => boolean, base: string): string {
    if (!isTaken(base)) return base;
    let counter = 1;
    while (isTaken(base + letterSuffix(counter))) counter++;
    return base + letterSuffix(counter);
}
