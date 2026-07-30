import { setIcon, Setting } from "obsidian";

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

/**
 * То же, но группа сворачивается по клику на заголовок. Нужна тем разделам,
 * которые велики и нужны не всегда: свёрнутыми они не мешают читать окно.
 */
export function collapsibleGroup(
    container: HTMLElement,
    name: string,
    description: string | undefined,
    opened: boolean,
): HTMLElement {
    const heading = new Setting(container).setName(name).setHeading();
    if (description) heading.setDesc(description);
    heading.settingEl.addClass("mfl-collapsible");

    const body = container.createDiv({ cls: "mfl-settings-group" });
    body.toggleClass("mfl-hidden", !opened);

    const chevron = heading.controlEl.createDiv({ cls: "clickable-icon" });
    setIcon(chevron, opened ? "chevron-down" : "chevron-right");

    heading.settingEl.addEventListener("click", () => {
        const willOpen = body.hasClass("mfl-hidden");
        body.toggleClass("mfl-hidden", !willOpen);
        setIcon(chevron, willOpen ? "chevron-down" : "chevron-right");
    });

    return body;
}
