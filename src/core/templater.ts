import { App, TFile } from "obsidian";

/**
 * Мост к плагину Templater. Свой движок шаблонов (`{{ поле }}`) остаётся
 * главным: он подставляет собранные формой значения. Templater отвечает за
 * своё — `<% tp.date.now() %>` и прочий код внутри того же шаблона.
 *
 * Всё через необязательные проверки: плагина может не быть, а его API не
 * объявлено публичным и когда-нибудь может измениться. Любая осечка здесь
 * означает «оставить текст как есть», а не сорвать заполнение формы.
 */

/** Идентификатор плагина в реестре Obsidian. */
const TEMPLATER_ID = "templater-obsidian";

/**
 * Как Templater смотрит на запуск. Нас интересует только вставка в открытую
 * заметку: у Templater это `AppendActiveFile`, второе значение перечисления.
 */
const RUN_MODE_APPEND_ACTIVE = 1;

interface TemplaterApi {
    create_running_config(templateFile: TFile, targetFile: TFile, runMode: number): unknown;
    parse_template(config: unknown, content: string): Promise<string>;
    overwrite_file_commands(file: TFile, activeFile?: boolean): Promise<void>;
}

interface PluginRegistry {
    plugins?: { plugins?: Record<string, { templater?: unknown } | undefined> };
}

function templaterApi(app: App): TemplaterApi | undefined {
    const plugin = (app as App & PluginRegistry).plugins?.plugins?.[TEMPLATER_ID];
    const api = plugin?.templater as TemplaterApi | undefined;

    // Проверяем не наличие плагина, а наличие нужных функций: чужое API нам
    // никто не обещал, и молчаливая ошибка «не функция» была бы хуже.
    if (typeof api?.parse_template !== "function") return undefined;
    if (typeof api.create_running_config !== "function") return undefined;
    if (typeof api.overwrite_file_commands !== "function") return undefined;
    return api;
}

export function isTemplaterAvailable(app: App): boolean {
    return templaterApi(app) !== undefined;
}

/**
 * Есть ли в тексте команды Templater. Проверка дешёвая и избавляет от
 * запуска чужого разбора там, где разбирать нечего.
 */
export function hasTemplaterCommands(text: string): boolean {
    return text.includes("<%");
}

/**
 * Прогоняет готовый текст через Templater. Контекстом служит открытая
 * заметка: из неё Templater берёт `tp.file`, без неё половина его функций
 * не имеет смысла.
 */
export async function parseWithTemplater(
    app: App,
    content: string,
    target: TFile,
): Promise<string> {
    const api = templaterApi(app);
    if (!api) return content;

    const config = api.create_running_config(target, target, RUN_MODE_APPEND_ACTIVE);
    return await api.parse_template(config, content);
}

/**
 * Исполняет команды Templater в уже созданной заметке — так делает и сам
 * Templater для команды «Replace templates in the active file». Для новой
 * заметки это правильнее разбора строки: `tp.file.title` и соседние функции
 * получают настоящий файл, а не тот, из которого запускали форму.
 */
export async function runTemplaterOnFile(app: App, file: TFile): Promise<void> {
    const api = templaterApi(app);
    if (!api) return;
    await api.overwrite_file_commands(file);
}
