/**
 * Русский словарь — исходник. Строки пишутся здесь, отсюда же берётся список
 * ключей: остальные языки объявлены как `Record<TranslationKey, string>`,
 * поэтому забытый перевод не соберётся.
 *
 * Ключи сгруппированы по месту в интерфейсе: `cmd` — палитра команд,
 * `settings` — вкладка настроек, `browser` — список форм, `type`/`mode`/
 * `format`/`open`/`condition` — подписи к вариантам выбора.
 */
export const ru = {
    // === Общее ===
    "common.cancel": "Отмена",
    "common.save": "Сохранить",
    "common.delete": "Удалить",
    "common.create": "Создать",
    "common.submit": "Отправить",
    "common.consoleHint": "Подробности в консоли",

    // === Команды палитры ===
    "cmd.createForm": "Создать форму",
    "cmd.openBrowser": "Браузер форм",
    "cmd.fillForm": "Заполнить форму…",
    "cmd.fill": "Заполнить: {title}",
    "cmd.noForms": "Форм пока нет — создайте первую",
    "cmd.needNoteUpdate": "Форма правит шапку заметки — сначала откройте заметку",
    "cmd.needNoteInsert": "Результат вставляется по месту курсора — сначала откройте заметку",
    "cmd.needEditor": "Команда работает только в открытой заметке",
    "cmd.restartHint": "Команды обновятся в палитре после перезапуска Obsidian",

    // === Типы полей ===
    "type.section": "Раздел",
    "type.text": "Текст",
    "type.textarea": "Многострочный текст",
    "type.email": "Электронная почта",
    "type.tel": "Телефон",
    "type.number": "Число",
    "type.slider": "Ползунок",
    "type.toggle": "Переключатель",
    "type.date": "Дата",
    "type.time": "Время",
    "type.datetime": "Дата и время",
    "type.select": "Выбор из списка",
    "type.multiselect": "Выбор нескольких",
    "type.tag": "Теги",
    "type.dataview": "Список из запроса Dataview",
    "type.note": "Заметка из папки",
    "type.folder": "Папка",
    "type.image": "Изображение",
    "type.file": "Файл",

    // === Что делает команда и в каком виде выводит ===
    "mode.update": "Изменить шапку текущей заметки",
    "mode.create": "Создать новую заметку",
    "mode.insert": "Вставить текстом по месту курсора",
    "format.frontmatter": "YAML в шапке заметки",
    "format.dataview": "Свойства (ключ:: значение)",
    "format.list": "Маркированный список",
    "open.current": "В текущей вкладке",
    "open.tab": "В новой вкладке",
    "open.split": "Рядом, во второй панели",
    "open.none": "Не открывать",

    // === Условия показа ===
    "condition.isSet": "заполнено",
    "condition.equals": "равно",
    "condition.contains": "содержит",
    "condition.startsWith": "начинается с",
    "condition.endsWith": "заканчивается на",
    "condition.above": "больше чем",
    "condition.below": "меньше чем",
    "condition.isTrue": "включено",
    "condition.isFalse": "выключено",

    // === Браузер форм ===
    "browser.folders": "Папки",
    "browser.newFolder": "Новая папка",
    "browser.folderName": "Название папки",
    "browser.allForms": "Все формы",
    "browser.noFolder": "Без папки",
    "browser.folderExists": "Папка «{name}» уже есть",
    "browser.forgetFolder": "Убрать пустую папку",
    "browser.deleteFolder": "Удалить папку",
    "browser.deleteFolderTitle": "Удалить папку «{name}»?",
    "browser.deleteFolderOne":
        "Папка — только ярлык у форм, поэтому сами формы останутся: единственная форма из неё переедет в «Без папки».",
    "browser.deleteFolderMany":
        "Папка — только ярлык у форм, поэтому сами формы останутся: все {count} формы переедут в «Без папки».",
    "browser.empty": "Форм пока нет",
    "browser.emptyFolder": "Пусто — перетащите сюда форму",
    "browser.moved": "«{title}» → {folder}",
    "browser.movedOut": "«{title}» — без папки",
    "browser.fields": "{count} полей",
    "browser.badName": "Идентификатор содержит недопустимые символы — переименуйте форму",
    "browser.hasTemplate": "Есть шаблон заметки",
    "browser.hasCommand": "Есть команда в палитре",
    "browser.editMeta": "Свойства формы",
    "browser.editFields": "Настройка полей",
    "browser.duplicate": "Дублировать",
    "browser.export": "Экспорт в буфер",
    "browser.exported": "Форма «{title}» скопирована в буфер обмена",
    "browser.clipboardFailed": "Не удалось обратиться к буферу обмена",
    "browser.deleteFormTitle": "Удалить форму?",
    "browser.deleteFormText": "Форма «{title}» будет удалена без возможности восстановления.",
    "browser.pickForm": "Какую форму заполнить?",

    // === Вкладка настроек ===
    "settings.formsGroup": "Формы",
    "settings.formsGroupDesc": "Формы хранятся в настройках плагина и вызываются по идентификатору",
    "settings.browser": "Браузер форм",
    "settings.browserDesc": "Список форм с папками и карточками: правка, дублирование, удаление",
    "settings.formList": "Список форм",
    "settings.createForm": "Создать форму",
    "settings.import": "Импорт форм",
    "settings.importDesc": "Вставить конверт форм из другого хранилища",
    "settings.importButton": "Импортировать",
    "settings.imported": "Импортировано форм: {count}",
    "settings.importRenamed": "Занятые имена переименованы: {names}",
    "settings.export": "Экспорт всех форм",
    "settings.exportDesc": "В конверт попадут все формы ({count}) и версия плагина",
    "settings.exportEmpty": "Экспортировать пока нечего — форм нет",
    "settings.exportClipboard": "В буфер",
    "settings.exportNote": "В заметку",
    "settings.exportedCount": "Скопировано форм: {count}",
    "settings.exportNoteTitle": "Формы {date}",
    "settings.exportNoteBody": "# Формы Modal Forms Lite\n\nЭкспорт от {date}.",
    "settings.noteFailed": "Не удалось создать заметку. Подробности в консоли",

    "settings.languageGroup": "Язык",
    "settings.language": "Язык плагина",
    "settings.languageDesc":
        "На каком языке говорят окна форм, настройки и команды в палитре",

    "settings.attachmentsGroup": "Вложения",
    "settings.imageFolder": "Место сохранения фотографий",
    "settings.imageFolderDesc": "Куда попадают JPEG, PNG и WebP из полей типа «Изображение»",
    "settings.fileFolder": "Место сохранения файлов",
    "settings.fileFolderDesc": "Куда попадает всё остальное из полей типа «Файл»",
    "settings.folderPlaceholder": "Корень хранилища",
    "settings.folderHint": "Начните вводить или выберите из списка",

    "settings.extraGroup": "Дополнительно",
    "settings.hideAllForms": "Скрывать «Все формы», когда всё разложено",
    "settings.hideAllFormsDesc":
        "В браузере форм слева останутся одни папки. Пока есть формы без папки, строка «Все формы» показывается в любом случае",
    "settings.skipDiscard": "Не спрашивать при закрытии без сохранения",
    "settings.skipDiscardDesc":
        "Редактор формы и редактор поля будут закрываться сразу. Несохранённые правки при этом теряются без предупреждения",
    "settings.dataview": "Разрешить поля «Список из запроса Dataview»",
    "settings.dataviewOn":
        "Плагин Dataview найден. Учтите: такие поля исполняют написанный вами JS-код",
    "settings.dataviewOff": "Плагин Dataview не установлен или отключён — включать нечего",
    "settings.templater": "Обрабатывать шаблоны через Templater",
    "settings.templaterOn":
        "Команды <% … %> в шаблоне формы исполнит Templater. Наши подстановки {{ поле }} отрабатывают первыми, Templater получает уже готовый текст",
    "settings.templaterOff": "Плагин Templater не установлен или отключён — включать нечего",
    "settings.globalName": "Имя переменной с API",
    "settings.globalNameDesc":
        "Сейчас скрипты обращаются к плагину как {name}.openForm(…). Менять стоит, только если это имя уже занято другим плагином",
    "settings.globalNameBad": "Имя переменной — латинские буквы, цифры и _, но не с цифры",
    "settings.globalNameSet": "API доступно как {name}",

    "settings.notesGroup": "Заметки",
    "settings.autoUpdate": "Автоматически обновлять заметки при изменении формы",
    "settings.autoUpdateDesc":
        "Если переименовать поле, плагин сразу переименует ключ во frontmatter заметок, созданных этой формой",
    "settings.scan": "Заметки со старыми полями",
    "settings.scanDesc": "Проверить, остались ли заметки с прежними названиями полей",
    "settings.scanButton": "Сканировать хранилище",
    "settings.scanNothing": "Заметок со старыми полями не найдено",
    "settings.scanFound": "Заметки с прежними названиями полей готовы к обновлению",
    "settings.scanApply": "Обновить заметки ({count})",
    "settings.notesUpdated": "Обновлено заметок: {count}",
    "settings.notesFailed": "Не удалось обновить: {count}. Подробности в консоли",

    // === Подтверждения ===
    "confirm.delete": "Удалить",
    "confirm.deleteFolder": "Удалить папку",
} as const;

export type TranslationKey = keyof typeof ru;
