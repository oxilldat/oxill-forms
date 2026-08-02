/**
 * Правила именования. Идентификаторы форм и полей попадают в пользовательский
 * код (`openForm("book")`, `{{ date_created }}`) и в свойства заметок, поэтому
 * набор символов узкий: латиница, цифры и подчёркивание.
 *
 * Первым символом — только буква. Имя, начинающееся с цифры, не годится ни в
 * переменную JavaScript, ни в ключ YAML без кавычек, а идентификатор
 * оказывается и там, и там.
 */

export const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export function isValidName(name: string): boolean {
    return NAME_PATTERN.test(name);
}

/**
 * Имя глобальной переменной плагина. Правила шире, чем у форм: это уже не
 * наш идентификатор, а имя в window, и оно обязано быть годным именем
 * переменной JavaScript — с цифрами, но не с цифры.
 */
export const GLOBAL_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isValidGlobalName(name: string): boolean {
    return GLOBAL_NAME_PATTERN.test(name);
}

/**
 * Вычищает всё, чего в идентификаторе быть не может, и снимает цифры и
 * подчёркивания в начале: они допустимы, но не первым символом, и оставлять
 * их до полной проверки значило бы показывать человеку заведомо негодное имя.
 */
export function stripToName(value: string): string {
    return value.replace(/[^A-Za-z0-9_]/g, "").replace(/^[0-9_]+/, "");
}

/**
 * Суффикс-счётчик из букв: 1 → A, 2 → B, 26 → Z, 27 → AA.
 * Цифры в имени теперь допустимы, но буквенный суффикс нагляднее: «bookA»
 * читается копией «book», а «book2» — самостоятельным именем.
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
