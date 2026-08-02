import { stripToName } from "../core/naming";

/**
 * Не даёт ввести в поле ничего, кроме годного идентификатора: посторонние
 * символы выкусываются прямо при вводе или вставке. Курсор возвращаем на место
 * сами — иначе после чистки он прыгал бы в конец строки и ломал правку в
 * середине.
 */
export function restrictToName(
    input: HTMLInputElement,
    onChange: (value: string) => void,
): void {
    input.addEventListener("input", () => {
        const cleaned = stripToName(input.value);
        if (cleaned !== input.value) {
            const caret = input.selectionStart ?? input.value.length;
            const position = stripToName(input.value.slice(0, caret)).length;
            input.value = cleaned;
            input.setSelectionRange(position, position);
        }
        onChange(cleaned);
    });
}
