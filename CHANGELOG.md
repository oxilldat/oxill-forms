# Changelog

## 0.2.0 — 2026-08-02

Two things you asked for. Nothing that existed before had to change: forms
made with earlier versions keep working as they did.

### Identifiers take digits and underscores

A field identifier used to be Latin letters and nothing else. Now it starts
with a letter and goes on with letters, digits and underscores, so the usual
`date_created` finally fits. The first character stays a letter on purpose —
an identifier becomes both a JavaScript variable and a YAML key, and neither
of those may begin with a digit.

### The date goes into the note name

`{{date:FORMAT}}` works everywhere placeholders work: the note name, the
folder, the note template and a field's default value. The format is
assembled from `YYYY`, `YY`, `MM`, `DD`, `HH`, `mm` and `ss`, so a note can
name itself `20260328232135` — fourteen digits, down to the second — or file
itself under `Diary/{{date:YYYY}}/{{date:MM}}` without a single field in the
form.

The name, the folder and the text are rendered from one moment in time, so a
timestamp in the name can't disagree with the same timestamp in the text when
a second happens to turn over between them.

`{{today}}`, `{{now}}` and `{{datetime}}` are still there — they are now the
short forms of `{{date:YYYY-MM-DD}}`, `{{date:HH:mm}}` and
`{{date:YYYY-MM-DDTHH:mm}}`.

## 0.1.4 — 2026-08-01

More notes from the directory review. Nothing changes for the user.

- The two `eslint-disable` comments in the file name patterns now say why they
  are there, instead of silencing the rule without a word.
- The constructor of an async function is reached through a narrowed prototype
  rather than through a value typed `any`.
- Duplicating a form in the browser and saving the field editor no longer hand
  a promise to a callback that expects nothing back.

## 0.1.3 — 2026-08-01

- The line under the “Forms” heading reads as a caption again — smaller,
  closer to the heading and without a rule under it. It had turned into a
  settings row of its own when the settings tab became declarative.

## 0.1.2 — 2026-08-01

Meeting the requirements of the Obsidian plugin directory. What the plugin
does has not changed.

- The settings tab is built from definitions instead of markup, so its
  settings are found by Obsidian's own settings search. The attachment folders
  use the built-in folder picker.
- The plugin language on a fresh install is read through the public
  `getLanguage()` API rather than the key Obsidian keeps in `localStorage`.
  It now follows the language of Obsidian: if Obsidian speaks English, so does
  the plugin, and the language of the system is no longer taken into account.
- Control characters in the file name patterns are marked as intentional —
  they arrive from the clipboard and break a name silently.

## 0.1.1 — 2026-08-01

Fixes from the automated directory review. Nothing changes for the user.

- The icon popup positions itself through `setCssStyles` instead of assigning
  styles directly.
- `setWarning` and `setDynamicTooltip` were deprecated in Obsidian 1.13; the
  first became `setDestructive`, the second is gone — the slider shows its
  value on its own now.
- Release assets carry GitHub build provenance, so anyone can verify that
  `main.js` was built from this repository.
- The `builtin-modules` dependency is gone: Node lists its own built-ins.
- Typing and lint cleanups around the values Obsidian hands over as `any`.

## 0.1.0 — 2026-08-01

First release.

### Forms

- Build a form once and fill it in a modal window.
- A form can create a note, insert text at the cursor, or edit the properties
  of the current note.
- Note name and folder are templates: `{{author}} — {{title}}`,
  `Books/{{genre}}`. Empty fields leave no dangling separators or empty path
  segments behind.
- Choose where the new note opens: current tab, new tab, split pane, or not at
  all.
- Note templates understand `{{ field }}` with transformations, plus
  `{{frontmatter}}` for every answer at once and `{{cursor}}` for where the
  cursor lands.

### Fields

19 types: text, multiline text, email, phone, number, slider, toggle, date,
time, date and time, select, multi-select, tags, Dataview query, note from a
folder, folder, image, file, and section headings.

- Labels, descriptions, placeholders, default values with `{{today}}`,
  required and hidden fields.
- Show conditions that depend on another field; a hidden section takes its
  fields with it.
- Answer checks: bounds for numbers, length for text, counts for multi-select
  and tags, regular expressions with your own error message. Email and phone
  are checked by type.
- Multi-select can draw from several folders at once or from a Dataview query.
- Tags can exclude whole branches by expression; folder fields can be limited
  to one subtree.
- Image and file fields take their own save folder, a file name template and —
  for files — a list of allowed extensions.

### Getting around

- Form browser with folders, drag and drop, duplication and export.
- Commands: create a form, open the browser, fill in a form by picking it from
  a list, plus a command per form.
- “Fill in a form…” in the context menu of a note and of the editor.
- Fields are reordered by dragging or with arrow buttons, and duplicated with a
  button.

### Notes and data

- Renaming a field renames the property in the notes the form created —
  automatically or on demand.
- Forms travel between vaults as one JSON bundle; the import warns about newer
  versions and shows Dataview code before running anything.

### Around the plugin

- Six languages: English, Russian, German, French, Spanish, Chinese. The
  language is picked from Obsidian on installation and changed in the settings
  afterwards.
- Templates can be handed over to Templater after our own placeholders run.
- A JavaScript API for Templater, QuickAdd, DataviewJS and the console,
  including a builder for forms that live inside a script.
