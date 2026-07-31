import { App, Editor, Notice, Plugin, TFile } from "obsidian";
import { ModalFormsApi } from "./api";
import { detectLocale, isLocale, setLanguage, t } from "./i18n";
import { renderNoteFolder, renderNoteName } from "./core/notePath";
import { extractCursor, renderNote, renderNoteText } from "./core/format";
import { isDataviewAvailable } from "./core/dataview";
import { addFolder, clearFolder, folderNames, removeFolder } from "./core/formFolders";
import * as formsRepo from "./core/forms";
import { applyNoteUpdates, scanNotes } from "./core/noteMigration";
import { defaultSettings, parseSettings } from "./core/settings";
import {
    hasTemplaterCommands,
    isTemplaterAvailable,
    parseWithTemplater,
    runTemplaterOnFile,
} from "./core/templater";
import { createNote } from "./core/vault";
import type { FormResult } from "./core/FormResult";
import type {
    EditorContext,
    FormCommand,
    FormDefinition,
    OpenMode,
    OutputFormat,
    PluginSettings,
} from "./core/types";
import { ModalFormsSettingTab } from "./settings/SettingsTab";
import { FormListModal } from "./ui/FormListModal";
import { FormMetaModal } from "./ui/FormMetaModal";
import { FormPickerModal } from "./ui/FormPickerModal";

/** Внутренний реестр команд Obsidian — в публичных типах его нет. */
interface CommandRegistry {
    commands?: { removeCommand?: (id: string) => void };
}

/**
 * Выбирал ли пользователь язык. Смотрим на сырые данные, а не на разобранные:
 * разбор подставляет английский вместо отсутствующего значения, и отличить
 * «не выбирал» от «выбрал английский» после него уже нельзя.
 */
function hasSavedLanguage(raw: unknown): boolean {
    if (typeof raw !== "object" || raw === null) return false;
    return isLocale((raw as { language?: unknown }).language);
}

function formatResult(result: FormResult, format: OutputFormat): string {
    switch (format) {
        case "frontmatter":
            return result.asFrontmatter();
        case "dataview":
            return result.asDataview();
        case "list":
            return result.asList();
    }
}

export default class ModalFormsLitePlugin extends Plugin {
    settings: PluginSettings = defaultSettings();
    api!: ModalFormsApi;
    /** Имена форм, для которых сейчас зарегистрирована команда. */
    private formCommands = new Set<string>();
    /** Имя, под которым API сейчас лежит в window. */
    private globalKey: string | null = null;
    private commandRemovalWarned = false;

    async onload(): Promise<void> {
        const saved = await this.loadData();
        this.settings = parseSettings(saved);

        // Первый запуск в этом хранилище: язык ещё никто не выбирал, поэтому
        // берём язык Obsidian — если такой словарь у нас есть. Дальше значение
        // живёт в настройках обычным образом и само меняться не будет.
        if (!hasSavedLanguage(saved)) {
            this.settings.language = detectLocale();
            await this.saveSettings();
        }

        // Язык — раньше всего: имена команд и подписи окон берутся уже из него.
        setLanguage(this.settings.language);

        // Настройки читаем через функцию, а не передаём объект: он
        // пересоздаётся при каждой правке, и захваченная ссылка протухла бы.
        this.api = new ModalFormsApi(this.app, () => this.settings);
        this.exposeApi(this.settings.globalName);

        this.addSettingTab(new ModalFormsSettingTab(this.app, this));

        this.addCommand({
            id: "create-form",
            name: t("cmd.createForm"),
            callback: () => this.openCreateFormModal(),
        });

        this.addCommand({
            id: "open-browser",
            name: t("cmd.openBrowser"),
            callback: () => new FormListModal(this.app, this).open(),
        });

        // Одна команда на все формы. Своя команда у формы остаётся способом
        // повесить горячую клавишу, а эта — чтобы попасть в любую форму, не
        // заводя команду на каждую.
        this.addCommand({
            id: "fill-form",
            name: t("cmd.fillForm"),
            callback: () => this.pickForm(),
        });

        this.registerMenus();
        this.syncFormCommands();
    }

    /**
     * Второй вход к формам — правый клик. По заметке в проводнике и по тексту
     * в редакторе: там, где заметка уже перед глазами, идти в палитру и
     * выбирать её заново — лишний путь.
     *
     * Пункт один и тот же, а не подменю со списком форм: форм со временем
     * становятся десятки, и меню Obsidian не должно расти вместе с ними.
     */
    private registerMenus(): void {
        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (!(file instanceof TFile) || file.extension !== "md") return;
                if (this.settings.forms.length === 0) return;

                menu.addItem((item) =>
                    item
                        .setTitle(t("cmd.fillForm"))
                        .setIcon("clipboard-list")
                        .onClick(() => this.pickForm()),
                );
            }),
        );

        this.registerEvent(
            this.app.workspace.on("editor-menu", (menu) => {
                if (this.settings.forms.length === 0) return;

                menu.addItem((item) =>
                    item
                        .setTitle(t("cmd.fillForm"))
                        .setIcon("clipboard-list")
                        .onClick(() => this.pickForm()),
                );
            }),
        );
    }

    /** Выбор формы из списка и запуск её так, как это делает своя команда. */
    private pickForm(): void {
        if (this.settings.forms.length === 0) {
            new Notice(t("cmd.noForms"));
            return;
        }
        new FormPickerModal(this.app, this.settings.forms, (form) =>
            this.runForm(form.name),
        ).open();
    }

    onunload(): void {
        // Оставлять ссылку на выгруженный плагин в window нельзя.
        this.exposeApi(null);
    }

    /**
     * Кладёт API в глобальную переменную с выбранным именем. Прежнюю чистим
     * сами: имя меняется в настройках на лету, и старое иначе осталось бы
     * висеть и указывать на тот же плагин под другим названием.
     *
     * `null` означает «убрать и не класть» — это выгрузка плагина.
     */
    exposeApi(name: string | null): void {
        const globals = window as unknown as Record<string, unknown>;
        if (this.globalKey !== null) delete globals[this.globalKey];

        this.globalKey = name;
        if (name !== null) globals[name] = this.api;
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /**
     * Перерегистрирует команды форм. Нужно после смены языка: имена команд
     * собираются один раз при регистрации, и сами по себе не переведутся.
     *
     * Названия трёх постоянных команд Obsidian держит у себя, и сменить их на
     * лету нельзя — они догонят язык после перезапуска.
     */
    refreshCommands(): void {
        this.syncFormCommands();
    }

    /** Точечная правка настроек: передаём только изменившиеся поля. */
    async updateSettings(patch: Partial<PluginSettings>): Promise<void> {
        this.settings = { ...this.settings, ...patch };
        await this.saveSettings();
    }

    /**
     * Собирается заново на каждое открытие редактора: и настройки, и наличие
     * Dataview могли поменяться с прошлого раза.
     */
    editorContext(): EditorContext {
        return {
            allowDataview: this.settings.dataviewEnabled && isDataviewAvailable(this.app),
            confirmDiscard: !this.settings.skipDiscardConfirm,
        };
    }

    // === Операции над формами ===
    // Тонкие обёртки: вся логика в core/forms.ts, здесь только сохранение.

    isNameTaken(name: string, exceptName?: string): boolean {
        return formsRepo.isNameTaken(this.settings.forms, name, exceptName);
    }

    async upsertForm(form: FormDefinition, originalName?: string): Promise<void> {
        this.settings.forms = formsRepo.upsertForm(this.settings.forms, form, originalName);
        await this.saveSettings();
        this.syncFormCommands();

        if (this.settings.autoUpdateNotes) await this.updateNotesFor(form);
    }

    /**
     * Приводит frontmatter заметок в соответствие с переименованными полями.
     * Идемпотентно: заметку с уже новым ключом поиск не находит, так что
     * повторный вызов ничего не делает.
     */
    async updateNotesFor(form: FormDefinition): Promise<void> {
        if ((form.renames ?? []).length === 0) return;

        const updates = scanNotes(this.app, [form]);
        if (updates.length === 0) return;

        const { changed, failed } = await applyNoteUpdates(this.app, updates);
        if (changed > 0) {
            new Notice(t("settings.notesUpdated", { count: changed }));
        }
        if (failed.length > 0) {
            new Notice(t("settings.notesFailed", { count: failed.length }));
        }
    }

    async removeForm(name: string): Promise<void> {
        this.settings.forms = formsRepo.removeForm(this.settings.forms, name);
        await this.saveSettings();
        this.syncFormCommands();
    }

    async duplicateForm(name: string): Promise<void> {
        this.settings.forms = formsRepo.duplicateForm(this.settings.forms, name);
        await this.saveSettings();
        this.syncFormCommands();
    }

    // === Папки форм ===

    /** Пустая папка живёт только в настройках — в формах её ещё никто не носит. */
    async createFolder(name: string): Promise<void> {
        await this.updateSettings({ folders: addFolder(this.settings.folders, name) });
    }

    /** Убирает пустую папку из списка. Форм с таким ярлыком нет по условию. */
    async forgetFolder(name: string): Promise<void> {
        await this.updateSettings({ folders: removeFolder(this.settings.folders, name) });
    }

    /**
     * Удаляет папку вместе с ярлыком у её форм. Сами формы остаются: папка их
     * не содержит, а только помечает, и терять работу из-за уборки в списке
     * никто не подписывался.
     *
     * Одной записью в data.json, а не через upsertForm на каждую форму: там
     * сохранение и пересборка команд на каждый шаг, а команды от папки не
     * зависят вовсе.
     */
    async deleteFolder(name: string): Promise<void> {
        this.settings.forms = clearFolder(this.settings.forms, name);
        this.settings.folders = removeFolder(this.settings.folders, name);
        await this.saveSettings();
    }

    /**
     * Перекладывает форму в другую папку. Папку, из которой форму вынесли,
     * запоминаем: она опустела прямо под курсором, и исчезни она в этот
     * момент — раскладывать формы дальше было бы некуда.
     */
    async moveFormToFolder(name: string, folder: string): Promise<void> {
        const form = formsRepo.findForm(this.settings.forms, name);
        if (!form) return;

        const from = form.folder?.trim() ?? "";
        const to = folder.trim();
        if (from === to) return;

        if (from !== "") this.settings.folders = addFolder(this.settings.folders, from);
        if (to !== "") this.settings.folders = addFolder(this.settings.folders, to);

        await this.upsertForm({ ...form, folder: to === "" ? undefined : to }, name);
    }

    /** Быстрый переключатель команды из списка форм. */
    async setFormCommand(name: string, enabled: boolean): Promise<void> {
        const form = formsRepo.findForm(this.settings.forms, name);
        if (!form) return;

        const command: FormCommand = form.command
            ? { ...form.command, enabled }
            : { enabled, mode: "insert", format: "dataview" };

        await this.upsertForm({ ...form, command }, name);
    }

    // === Команды форм ===

    /**
     * Приводит набор зарегистрированных команд в соответствие с настройками.
     * Вызывается после любой правки форм: переименование или снятие галочки
     * иначе оставило бы в палитре команду-призрак.
     */
    private syncFormCommands(): void {
        // Перерегистрируем всё целиком, а не только появившееся и исчезнувшее.
        // У формы мог поменяться режим команды, а он определяет, какой
        // обработчик вешать: оставленная на месте команда работала бы по
        // старым правилам до перезапуска Obsidian.
        for (const name of [...this.formCommands]) this.removeFormCommand(name);

        for (const form of this.settings.forms) {
            if (form.command?.enabled === true) this.addFormCommand(form.name);
        }
    }

    private addFormCommand(name: string): void {
        const form = formsRepo.findForm(this.settings.forms, name);
        const command = form?.command;
        if (!form || !command?.enabled) return;

        const id = `fill-${name}`;
        const label = t("cmd.fill", { title: form.title });

        if (command.mode === "create") {
            this.addCommand({
                id,
                name: label,
                // Заметку создаём сами, поэтому открытый редактор не нужен.
                callback: () => {
                    const fresh = this.freshForm(name);
                    if (fresh) void this.createNoteFromForm(fresh, fresh.command!);
                },
            });
        } else if (command.mode === "update") {
            this.addCommand({
                id,
                name: label,
                editorCallback: (_editor, context) => {
                    const file = context.file;
                    if (!file) {
                        new Notice(t("cmd.needEditor"));
                        return;
                    }
                    const fresh = this.freshForm(name);
                    if (fresh) void this.updateNoteFromForm(fresh, file);
                },
            });
        } else {
            this.addCommand({
                id,
                name: label,
                // editorCallback — команда видна только когда открыт редактор:
                // вставлять результат больше некуда.
                editorCallback: (editor) => {
                    const fresh = this.freshForm(name);
                    if (fresh) void this.insertFromForm(fresh, fresh.command!, editor);
                },
            });
        }
        this.formCommands.add(name);
    }

    /**
     * Заполнение формы тем же способом, что и её команда в палитре: режим
     * берётся из настроек формы. Команда может быть и выключена — выбор из
     * списка не про палитру, а про то, чтобы форму вообще можно было позвать.
     *
     * Контекст здесь ищем сами: команда-обёртка про открытый редактор ничего
     * не знает, а режимам «вставить» и «изменить» он нужен.
     */
    private runForm(name: string): void {
        const form = formsRepo.findForm(this.settings.forms, name);
        if (!form) return;

        const command: FormCommand = form.command ?? {
            enabled: false,
            mode: "insert",
            format: "dataview",
        };

        if (command.mode === "create") {
            void this.createNoteFromForm(form, command);
            return;
        }

        if (command.mode === "update") {
            const file = this.app.workspace.getActiveFile();
            if (!file) {
                new Notice(t("cmd.needNoteUpdate"));
                return;
            }
            void this.updateNoteFromForm(form, file);
            return;
        }

        const editor = this.app.workspace.activeEditor?.editor;
        if (!editor) {
            new Notice(t("cmd.needNoteInsert"));
            return;
        }
        void this.insertFromForm(form, command, editor);
    }

    /**
     * Форма на момент нажатия, а не на момент регистрации команды. Иначе
     * добавленный позже шаблон и правки полей до команды не доезжали.
     */
    private freshForm(name: string): FormDefinition | undefined {
        const form = formsRepo.findForm(this.settings.forms, name);
        return form?.command?.enabled === true ? form : undefined;
    }

    /**
     * Режим «изменить»: значения формы уезжают в шапку текущей заметки.
     * Форма открывается уже заполненной из этой же шапки, поэтому правишь
     * то, что видишь, а не вбиваешь всё заново.
     */
    private async updateNoteFromForm(form: FormDefinition, file: TFile): Promise<void> {
        const result = await this.api.openForm(form.name, { fromNote: true });
        if (!result.ok) return;

        const data = result.getData();
        try {
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                for (const [key, value] of Object.entries(data)) {
                    frontmatter[key] = value;
                }
                // Поле, которое было на экране и осталось пустым, пользователь
                // очистил намеренно — убираем ключ, а не оставляем старое.
                for (const key of result.cleared) {
                    delete frontmatter[key];
                }
            });
            new Notice(`Шапка заметки «${file.basename}» обновлена`);
        } catch (error) {
            console.error("[modal-forms-lite] не удалось обновить шапку", error);
            new Notice("Не удалось обновить шапку заметки. Подробности в консоли");
        }
    }

    /** Режим «вставить»: шаблон формы или готовый формат по месту курсора. */
    private async insertFromForm(
        form: FormDefinition,
        command: FormCommand,
        editor: Editor,
    ): Promise<void> {
        const result = await this.api.openForm(form.name, { fromNote: true });
        if (!result.ok) return;

        if (!form.template) {
            editor.replaceSelection(formatResult(result, command.format));
            return;
        }

        // Сначала наши подстановки, потом Templater, и только потом ищем метку
        // курсора: Templater меняет длину текста, и посчитанное до него
        // смещение указывало бы не туда.
        const rendered = renderNoteText(form.template, result.getData(), result.asFrontmatter());
        const note = extractCursor(await this.applyTemplater(rendered));
        const from = editor.getCursor("from");
        editor.replaceSelection(note.text);

        // Метка {{cursor}} в шаблоне: ставим курсор туда, а не в конец вставки.
        if (note.cursor !== undefined) {
            editor.setCursor(editor.offsetToPos(editor.posToOffset(from) + note.cursor));
        }
    }

    /**
     * Стоит ли звать Templater: настройка включена, плагин на месте и в тексте
     * действительно есть его команды. Последнее — чтобы обычные шаблоны не
     * ходили через чужой разбор без всякой надобности.
     */
    private templaterReady(text: string): boolean {
        return (
            this.settings.templaterEnabled &&
            hasTemplaterCommands(text) &&
            isTemplaterAvailable(this.app)
        );
    }

    /**
     * Прогоняет текст через Templater, если это уместно. Осечка чужого
     * плагина не должна ронять вставку: возвращаем текст как есть и говорим
     * об этом вслух.
     */
    private async applyTemplater(text: string): Promise<string> {
        if (!this.templaterReady(text)) return text;

        // Контекстом служит открытая заметка — из неё Templater берёт tp.file.
        const file = this.app.workspace.getActiveFile();
        if (!file) return text;

        try {
            return await parseWithTemplater(this.app, text, file);
        } catch (error) {
            console.error("[modal-forms-lite] Templater не отработал", error);
            new Notice("Templater не смог разобрать шаблон. Подробности в консоли");
            return text;
        }
    }

    /** Режим «создать заметку»: спросить форму, сложить файл, открыть его. */
    private async createNoteFromForm(form: FormDefinition, command: FormCommand): Promise<void> {
        const result = await this.api.openForm(form.name);
        if (!result.ok) return;

        const data = result.getData();
        // Имя и папка — шаблоны с теми же подстановками, что и текст заметки.
        // Заголовок формы остаётся запасным именем: заметка без имени не бывает.
        const baseName = renderNoteName(command.nameTemplate, data, form.title);
        const folder = renderNoteFolder(command.folder, data);

        // Шаблон формы важнее готовых форматов: он и написан ради этого.
        let content: string;
        if (form.template) {
            content = renderNote(form.template, result.getData(), result.asFrontmatter()).text;
        } else {
            const body = formatResult(result, command.format);
            content =
                command.format === "frontmatter"
                    ? `---\n${body}\n---\n\n# ${baseName}\n`
                    : `# ${baseName}\n\n${body}\n`;
        }

        try {
            const file = await createNote(this.app, folder, baseName, content);

            // Для новой заметки отдаём Templater сам файл, а не строку: его
            // `tp.file.title` и соседи должны говорить о ней, а не о той
            // заметке, из которой форму позвали.
            if (this.templaterReady(content)) {
                try {
                    await runTemplaterOnFile(this.app, file);
                } catch (error) {
                    console.error("[modal-forms-lite] Templater не отработал", error);
                    new Notice("Templater не смог разобрать шаблон. Подробности в консоли");
                }
            }

            await this.openCreated(file, command.openIn ?? "current");
        } catch (error) {
            console.error("[modal-forms-lite] не удалось создать заметку", error);
            new Notice(t("settings.noteFailed"));
        }
    }

    /**
     * Показывает созданную заметку. «Не открывать» нужно серийному вводу —
     * но тогда обязательно сообщение: иначе непонятно, случилось ли что-нибудь.
     */
    private async openCreated(file: TFile, openIn: OpenMode): Promise<void> {
        if (openIn === "none") {
            new Notice(`Заметка «${file.basename}» создана`);
            return;
        }

        const leaf =
            openIn === "split"
                ? this.app.workspace.getLeaf("split")
                : this.app.workspace.getLeaf(openIn === "tab" ? "tab" : false);

        await leaf.openFile(file);
    }

    /**
     * Публичного способа убрать команду у Plugin нет, а перерегистрация с тем
     * же идентификатором её не удаляет. Пользуемся внутренним реестром, но
     * аккуратно: если его не окажется, честно говорим про перезагрузку.
     */
    private removeFormCommand(name: string): void {
        this.formCommands.delete(name);

        const registry = (this.app as App & CommandRegistry).commands;
        const fullId = `${this.manifest.id}:fill-${name}`;
        if (typeof registry?.removeCommand === "function") {
            registry.removeCommand(fullId);
            return;
        }

        // Перерегистрация идёт на каждое сохранение, поэтому предупреждаем
        // один раз за сеанс, а не по разу на форму.
        if (!this.commandRemovalWarned) {
            this.commandRemovalWarned = true;
            new Notice(t("cmd.restartHint"));
        }
    }

    openCreateFormModal(): void {
        new FormMetaModal(this.app, {
            folders: folderNames(this.settings.forms, this.settings.folders),
            isNameTaken: (name) => this.isNameTaken(name),
            onSubmit: async ({ name, title, folder, icon, command, template }) => {
                await this.upsertForm({
                    name,
                    title,
                    version: 1,
                    folder,
                    icon,
                    command,
                    template,
                    fields: [],
                });
                new Notice(`Форма «${title}» создана`);
            },
        }).open();
    }
}
