import { blockEditorEn } from "@gotipe/block-editor";
import { type Locale, en } from "@gotipe/i18n";

/**
 * A custom locale, as on the i18n page: English as the base, so every key the app leaves
 * untranslated stays readable, and a few German strings of the menus and placeholders.
 */
export const de: Locale = {
  ...en,
  ...blockEditorEn,
  "placeholder.paragraph": "Text",
  "slashMenu.menu": "Block einfügen",
  "slashMenu.empty": "Keine Treffer",
  "slash.text": "Text",
  "slash.heading1": "Überschrift 1",
  "slash.heading2": "Überschrift 2",
  "slash.heading3": "Überschrift 3",
  "slash.bulletList": "Aufzählung",
  "slash.orderedList": "Nummerierte Liste",
  "slash.todoList": "Aufgabenliste",
  "slash.quote": "Zitat",
  "slash.code": "Code",
  "slash.table": "Tabelle",
  "slash.divider": "Trennlinie",
  "slash.callout": "Hinweis",
  "slashMenu.group.style": "Stil",
  "slashMenu.group.insert": "Einfügen",
  "slashMenu.group.upload": "Hochladen",
  "slashMenu.heading1": "Überschrift 1",
  "slashMenu.heading2": "Überschrift 2",
  "slashMenu.heading3": "Überschrift 3",
  "slashMenu.bulletList": "Aufzählung",
  "slashMenu.orderedList": "Nummerierte Liste",
  "slashMenu.todoList": "Aufgabenliste",
  "slashMenu.codeBlock": "Codeblock",
  "slashMenu.blockquote": "Zitat",
  "slashMenu.table": "Tabelle",
  "slashMenu.divider": "Trennlinie",
  "slashMenu.callout": "Hinweis",
  "toolbar.bold": "Fett",
  "toolbar.italic": "Kursiv",
  "toolbar.underline": "Unterstrichen",
  "toolbar.strikethrough": "Durchgestrichen",
  "toolbar.code": "Code",
  "toolbar.link": "Link",
  "block.handle": "Blockaktionen",
  "block.duplicate": "Duplizieren",
  "block.delete": "Löschen",
};
