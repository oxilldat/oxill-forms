# Modal Forms Lite

[English version](README.md)

Плагин Obsidian: формы для структурированного ввода данных, вызываемые
откуда угодно, где исполняется JavaScript.

## Разработка

```bash
npm install          # зависимости
npm run dev          # сборка в watch-режиме прямо в тестовое хранилище
npm run build   # сборка в корень репозитория
npm run check        # проверка типов
npm test             # тесты
```

`npm run dev` собирает в `../test-vault/.obsidian/plugins/modal-forms-lite/`
и следит за `src/`, `styles.css` и `manifest.json`. После правки —
`Ctrl+P` → **Reload app without saving** в Obsidian.

## Устройство

```
src/
├── main.ts            точка входа: настройки, команды, починка заметок
├── api.ts             публичный MFL: openForm, getForm, listForms
├── core/              логика без Obsidian (кроме vault и attachments)
│   ├── types.ts       модель формы, поля, условия, команды
│   ├── settings.ts    разбор data.json, устойчивый к мусору
│   ├── fields.ts      операции над полями и их проверка
│   ├── forms.ts       операции над списком форм
│   ├── conditions.ts  условия показа полей
│   ├── format.ts      сборка текста результата
│   ├── transform.ts   преобразования значений
│   ├── noteMigration.ts  поиск и починка заметок после переименования
│   ├── vault.ts       запросы к хранилищу
│   └── attachments.ts загрузка вложений
├── ui/                модальные окна и виджеты
└── settings/          вкладка настроек
```

Тесты лежат рядом с кодом: `src/core/*.test.ts`. Покрыта логика, не
зависящая от Obsidian — именно в ней живут неочевидные вещи вроде
сравнения дат строками и правила опознания заметок.

## Типы полей

`text`, `textarea`, `email`, `tel`, `number`, `slider`, `toggle`, `date`,
`time`, `datetime`, `select` (заданный список или заметки из папки),
`multiselect` (там же, папок может быть несколько, плюс запрос Dataview),
`tag`, `dataview`, `note`, `folder`, `image`, `file`.

У поля бывают: подпись, описание, обязательность, скрытость и условие
показа, зависящее от другого поля. У `image` и `file` — своя папка
сохранения (пусто — общая из настроек) и шаблон имени файла с
подстановками `{{поле}}`; у `file` ещё список допустимых расширений.
У `tag` — регулярное выражение, отсекающее ненужные ветки тегов; у
`folder` — папка, внутри которой идёт выбор.

## API

```js
const result = await MFL.openForm("book");
if (!result.ok) return;                       // форму закрыли

result.getData()                              // объект
result.get("title")                           // одно значение
result.link("author")                          // [[Лев Толстой]]
result.asFrontmatter({ omit: ["target"] })     // YAML без служебных полей
result.asDataview()                            // ключ:: значение
result.asList()                                // маркированный список
result.asString("{{ title | slug }}")          // подстановка с преобразованием
```

Преобразования: `upper`, `lower`, `trim`, `capitalize`, `slug`, `snake`,
`link`, `list`.

Форму можно собрать прямо в скрипте — тогда её не нужно заводить в
настройках, и шаблон получается самодостаточным:

```js
const form = MFL.builder("book", "Новая книга")
    .text({ name: "title", label: "Название", required: true })
    .select({ name: "status", options: ["Читаю", "Прочитано"] })
    .slider({ name: "rating", label: "Оценка", min: 1, max: 5 })
    .build();

const result = await MFL.openForm(form);
```

Имя `MFL` меняется в настройках — на случай, если оно уже занято.

## Отличия от obsidian-modal-form

Плагин написан с нуля по мотивам
[obsidian-modal-form](https://github.com/danielo515/obsidian-modal-form).
Своё: латиница в идентификаторах с фильтрацией ввода, подтверждение перед
потерей правок, выключатель исполнения кода, починка заметок после
переименования полей, версии форм, папки форм с перетаскиванием.

Шаблоны обрабатывает свой движок. Если включить в настройках обработку
через Templater, команды `<% … %>` в том же шаблоне исполнит он — наши
подстановки `{{ поле }}` отрабатывают первыми и отдают ему готовый текст.

Чего нет: живых блоков с кодом внутри формы (`document_block`,
`markdown_block`), конструктора шаблонов, редактирования форм в боковой
панели.

## Лицензия

MIT
