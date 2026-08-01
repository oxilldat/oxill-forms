# Changelog

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
