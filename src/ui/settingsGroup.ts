import { Setting } from "obsidian";

/**
 * Группа настроек карточкой: заголовок раздела стоит снаружи, строки —
 * внутри. Карточку рисует сама группа, а у строк фон и скругления
 * снимаются стилями: иначе вид зависел бы от того, что делает с
 * отдельными строками текущая тема.
 *
 * Возвращает контейнер, в который кладутся `new Setting(...)` этой группы.
 */
export function settingsGroup(
    container: HTMLElement,
    name: string,
    description?: string,
): HTMLElement {
    const heading = new Setting(container).setName(name).setHeading();
    if (description) heading.setDesc(description);
    return container.createDiv({ cls: "mfl-settings-group" });
}
