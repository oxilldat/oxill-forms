import { Setting } from "obsidian";

/**
 * Группа настроек карточкой: заголовок раздела стоит снаружи, строки —
 * внутри.
 *
 * Разметка нативная для Obsidian — `.setting-group` с вложенным
 * `.setting-items`. Своя карточка здесь не годится: в модалках движок
 * правилом
 *
 *     .modal:not(.mod-settings) .setting-item:not(.setting-item-heading)
 *     :where(:not(.setting-group *)) { padding: var(--size-4-4) 0 }
 *
 * сносит строкам боковые отступы. Вес у него (0,4,0), у любого нашего
 * `.mfl-settings-group .setting-item` — (0,2,0), и порядок загрузки не
 * спасает. Хвост `:where(:not(.setting-group *))` — оставленная дверь: всё,
 * что лежит внутри `.setting-group`, из-под правила выходит. Поэтому и
 * разметка чужая, и `!important` в стилях не нужен.
 *
 * Возвращает `.setting-items`, в который кладутся `new Setting(...)` группы.
 */
export function settingsGroup(
    container: HTMLElement,
    name: string,
    description?: string,
): HTMLElement {
    const group = container.createDiv({ cls: "setting-group mfl-settings-group" });
    // Заголовок лежит в группе, но выше карточки: снаружи её рисует сам
    // Obsidian, выравнивая по тем же отступам, что и строки внутри.
    const heading = new Setting(group).setName(name).setHeading();
    if (description) heading.setDesc(description);
    return group.createDiv({ cls: "setting-items" });
}

/**
 * Та же карточка, но без заголовка. Нужна там, где раздел и так понятен по
 * содержимому, а подпись над каждой парой строк только дробила бы окно.
 */
export function plainGroup(container: HTMLElement): HTMLElement {
    const group = container.createDiv({ cls: "setting-group mfl-settings-group" });
    return group.createDiv({ cls: "setting-items" });
}
