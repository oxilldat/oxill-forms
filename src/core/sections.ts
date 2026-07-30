import type { FieldDefinition } from "./types";

/**
 * Разделы группируют поля по положению в списке: поле принадлежит последнему
 * разделу, объявленному выше него. Отдельного признака «поле в разделе» в
 * модели нет намеренно — порядок в редакторе и есть то, что видит человек.
 */

/**
 * Для каждого поля — раздел, в котором оно лежит. Поля до первого раздела и
 * сами разделы в карту не попадают.
 */
export function sectionOwners(fields: FieldDefinition[]): Map<string, FieldDefinition> {
    const owners = new Map<string, FieldDefinition>();
    let current: FieldDefinition | undefined;

    for (const field of fields) {
        if (field.input.type === "section") {
            current = field;
            continue;
        }
        if (current) owners.set(field.name, current);
    }
    return owners;
}
