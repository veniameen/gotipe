export type TranslationKey =
  | "toolbar.bold"
  | "toolbar.italic"
  | "toolbar.underline"
  | "toolbar.strikethrough"
  | "toolbar.code"
  | "toolbar.link"
  | "toolbar.highlight"
  | "toolbar.heading"
  | "toolbar.bulletList"
  | "toolbar.orderedList"
  | "toolbar.todoList"
  | "toolbar.blockquote"
  | "toolbar.codeBlock"
  | "toolbar.table"
  | "toolbar.image"
  | "toolbar.divider"
  | "toolbar.undo"
  | "toolbar.redo"
  | "placeholder.empty"
  | "placeholder.slashCommand"
  | "slashMenu.heading1"
  | "slashMenu.heading2"
  | "slashMenu.heading3"
  | "slashMenu.bulletList"
  | "slashMenu.orderedList"
  | "slashMenu.todoList"
  | "slashMenu.codeBlock"
  | "slashMenu.blockquote"
  | "slashMenu.table"
  | "slashMenu.image"
  | "slashMenu.divider"
  | "slashMenu.callout"
  | "slashMenu.toggle"
  | "slashMenu.columns"
  | "slashMenu.embed"
  | "slashMenu.math"
  | "slashMenu.file"
  | "comments.add"
  | "comments.resolve"
  | "comments.reply"
  | "comments.delete"
  | "ai.complete"
  | "ai.rewrite"
  | "ai.summarize"
  | "ai.translate"
  | "ai.fixGrammar"
  | "a11y.editorLabel"
  | "a11y.toolbarLabel";

export type Locale = Record<TranslationKey, string>;

export interface I18n {
  t(key: TranslationKey, params?: Record<string, string | number>): string;
  locale: string;
  setLocale(locale: string): void;
  addLocale(name: string, translations: Locale): void;
}
