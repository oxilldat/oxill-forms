/**
 * Дата и время в шаблонах.
 *
 * Здесь нет Obsidian — а значит, нет и `moment`, который он приносит с собой.
 * Формат свой, из шести букв: этого хватает на всё, ради чего дату вставляют
 * в имя заметки, а чужой синтаксис пришлось бы объяснять целиком, вместе с
 * теми его половинами, которых у нас нет.
 */

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

/**
 * Буквы формата. Длинные стоят раньше коротких: перебор идёт слева направо,
 * и `YY` перехватил бы начало `YYYY`.
 *
 * Замена одна и сплошная, результат заново не просматривается — поэтому год
 * `2026` не может быть принят за что-то ещё.
 */
const FORMAT_LETTERS = /YYYY|YY|MM|DD|HH|mm|ss/g;

export function formatDateTime(now: Date, format: string): string {
    return format.replace(FORMAT_LETTERS, (letters) => {
        switch (letters) {
            case "YYYY":
                return String(now.getFullYear());
            case "YY":
                return pad(now.getFullYear() % 100);
            case "MM":
                return pad(now.getMonth() + 1);
            case "DD":
                return pad(now.getDate());
            case "HH":
                return pad(now.getHours());
            case "mm":
                return pad(now.getMinutes());
            case "ss":
                return pad(now.getSeconds());
            default:
                return letters;
        }
    });
}

/** `{{date:ФОРМАТ}}` — двоеточие, потому что вертикальная черта занята
 *  преобразованиями. Формат берём как есть, до закрывающих скобок. */
const DATE_TOKEN = /\{\{\s*date\s*:\s*([^}]*?)\s*\}\}/g;

/**
 * Подстановки времени. Кроме `{{date:ФОРМАТ}}` понимаются три коротких
 * записи — они были в плагине раньше и остались как сокращения: у людей они
 * уже стоят в формах.
 *
 * Пустой формат — `{{date:}}` — оставляем в тексте нетронутым. Молча выдать
 * пустоту значило бы спрятать опечатку, а в имени заметки её потом не найти.
 */
export function resolveDateTokens(text: string, now: Date): string {
    return text
        .replace(DATE_TOKEN, (match, format: string) =>
            format === "" ? match : formatDateTime(now, format),
        )
        .replace(/\{\{\s*today\s*\}\}/g, formatDateTime(now, "YYYY-MM-DD"))
        .replace(/\{\{\s*now\s*\}\}/g, formatDateTime(now, "HH:mm"))
        .replace(/\{\{\s*datetime\s*\}\}/g, formatDateTime(now, "YYYY-MM-DDTHH:mm"));
}
