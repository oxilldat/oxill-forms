# Modal Forms Lite

Build a form once, then fill it in a modal window — and get a note.

Obsidian is good at holding structured data and awkward at capturing it. This
plugin adds the missing step: a form with labels, required fields and validation
that ends with a real note — created from a template, with its properties
updated, or with text inserted where the cursor is.

[Русская версия документации](README.ru.md)

> Written from scratch, inspired by
> [obsidian-modal-form](https://github.com/danielo515/obsidian-modal-form).

## What it does

- **Form browser** — forms live in folders, move between them by drag and drop.
- **Three things a form can do**: create a note, edit the properties of the
  current note, or insert text at the cursor.
- **Note name and folder are templates**: `{{author}} — {{title}}`,
  `Books/{{genre}}`. Empty fields leave no dangling separators behind.
- **Answers are checked** — not just “filled in”, but ranges, lengths, counts
  and regular expressions, with your own error message when a regex needs one.
- **Nothing is lost by accident**: closing a filled form or an edited form asks
  first.
- **Renaming a field fixes the notes** it already created — the key in their
  frontmatter is renamed too.
- **Six languages**: English, Russian, German, French, Spanish, Chinese. The
  plugin picks one at install time by looking at Obsidian; you can change it in
  the settings.

## Getting started

1. Open the plugin settings → **Create form**, give it an identifier (Latin
   letters — code calls the form by it) and a title.
2. Press **Field setup** and add fields.
3. Fill the form: the **Fill in a form…** command, the form browser, or a
   right click on a note.

Give a form its own command in **Command in the palette** if you want a hotkey
for it.

## Field types

`text`, `textarea`, `email`, `tel`, `number`, `slider`, `toggle`, `date`,
`time`, `datetime`, `select`, `multiselect`, `tag`, `dataview`, `note`,
`folder`, `image`, `file`, plus `section` — a heading that splits a long form
into readable blocks.

Every field takes a label, a description, a placeholder, a default value, and a
show condition that depends on another field. Beyond that:

| Field | Extras |
| --- | --- |
| `select`, `multiselect` | fixed list, notes from folders, or a Dataview query |
| `multiselect` | several source folders at once |
| `tag` | a regular expression for tags you never want suggested |
| `note`, `folder` | the folder to pick from; `folder` can be limited to a subtree |
| `image`, `file` | own save folder, file name template; `file` also takes allowed extensions |
| `number`, `slider`, text fields | range, length, count, regular expression |

## Templates

A note template understands `{{ field }}` with transformations —
`{{ title | slug }}` — plus two special placeholders: `{{frontmatter}}` for the
whole YAML header and `{{cursor}}` for where the cursor lands after insertion.

Transformations: `upper`, `lower`, `trim`, `capitalize`, `slug`, `snake`,
`link`, `list`.

If you use [Templater](https://github.com/SilentVoid13/Templater), turn on
**Process templates with Templater** in the settings: our `{{ field }}`
placeholders run first, and Templater receives finished text to execute its
`<% … %>` commands on.

## API

Forms are open to Templater, QuickAdd, DataviewJS and the console:

```js
const result = await MFL.openForm("book");
if (!result.ok) return;                       // the form was closed

result.getData()                              // an object
result.get("title")                           // a single value
result.link("author")                         // [[Leo Tolstoy]]
result.asFrontmatter({ omit: ["target"] })    // YAML without service fields
result.asDataview()                           // key:: value
result.asList()                               // a bullet list
result.asString("{{ title | slug }}")         // a template with a transformation
```

A form can also be built in code, so a Templater template carries its own form
and needs nothing set up in the settings:

```js
const form = MFL.builder("book", "New book")
    .text({ name: "title", label: "Title", required: true })
    .select({ name: "status", options: ["To read", "Reading", "Finished"] })
    .slider({ name: "rating", label: "Rating", min: 1, max: 5 })
    .build();

const result = await MFL.openForm(form);
```

`openForm` also takes `{ values }` to prefill fields and `{ fromNote: true }`
to prefill them from the open note. The `MFL` name can be changed in the
settings if another plugin took it.

## Requirements and limits

- Obsidian **1.13.0** or newer — the settings cards use its native markup.
- Works on mobile, but dragging forms and fields does not: HTML5 drag and drop
  does not answer to touch. Order is also changed with the arrow buttons.
- Dataview fields execute the JS you write in them. The type stays disabled
  until you allow it in the settings, and importing a form with such fields
  shows the code and asks twice.

## Development

```bash
npm install
npm run dev     # watch build
npm run build   # production build into the repository root
npm test        # 172 tests on the logic that does not need Obsidian
npm run check   # tsc --noEmit
```

`npm run dev` also copies the build into a vault for testing: set `MFL_VAULT`
to the plugin folder inside it, or keep a `test-vault` next to the repository.

## License

[MIT](LICENSE)
