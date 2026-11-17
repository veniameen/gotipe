import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import type { I18n, TranslationKey } from "@gotipe/i18n";
import { withBlockEditorStrings } from "../i18n/strings";
import type { PageIconName } from "./icons";

/** A block the page editor can insert (the slash menu and the blocks button). */
export interface PageBlockCommand extends SlashCommandDef {
  /** Icon of the row. */
  pageIcon: PageIconName;
  /** Markdown shortcut shown on the right of the row (“#”, “-”, “```”). */
  shortcut?: string;
}

export type PageBlockKind =
  | "image"
  | "file"
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "todoList"
  | "quote"
  | "code"
  | "table"
  | "divider"
  | "callout";

interface Spec {
  kind: PageBlockKind;
  label: TranslationKey;
  icon: PageIconName;
  group: "upload" | "style" | "insert";
  shortcut?: string;
  aliases: string[];
  run: (editor: GoTipeEditor) => void;
}

function currentBlockIsEmptyParagraph(editor: GoTipeEditor): boolean {
  const block = editor.getCurrentBlock();
  return !!block && block.type === "paragraph" && block.isEmpty;
}

/** Inserts a leaf block, replacing the current empty paragraph. */
function insertLeaf(editor: GoTipeEditor, type: string, attrs: Record<string, unknown>) {
  const current = editor.getCurrentBlock();
  if (current && currentBlockIsEmptyParagraph(editor)) {
    editor.chain().insertBlockAfter(type, attrs).run();
    editor.chain().deleteBlock(current.id).run();
    return;
  }
  editor.chain().insertBlockAfter(type, attrs).run();
}

const SPECS: Spec[] = [
  {
    kind: "image",
    label: "slash.image",
    icon: "image",
    group: "upload",
    aliases: ["image", "img", "picture", "картинка", "изображение", "фото"],
    run: (e) => insertLeaf(e, "image", { src: "", alt: "", caption: "" }),
  },
  {
    kind: "file",
    label: "slash.file",
    icon: "file",
    group: "upload",
    aliases: ["file", "attachment", "файл", "вложение"],
    run: (e) => insertLeaf(e, "file", { url: "", name: "" }),
  },
  {
    kind: "text",
    label: "slash.text",
    icon: "text",
    group: "style",
    aliases: ["text", "paragraph", "текст", "абзац"],
    run: (e) => e.chain().setBlockType("paragraph").run(),
  },
  {
    kind: "heading1",
    label: "slash.heading1",
    icon: "h1",
    group: "style",
    shortcut: "#",
    aliases: ["h1", "heading", "title", "заголовок"],
    run: (e) => e.chain().setBlockType("heading", { level: 1 }).run(),
  },
  {
    kind: "heading2",
    label: "slash.heading2",
    icon: "h2",
    group: "style",
    shortcut: "##",
    aliases: ["h2", "heading", "subtitle", "заголовок"],
    run: (e) => e.chain().setBlockType("heading", { level: 2 }).run(),
  },
  {
    kind: "heading3",
    label: "slash.heading3",
    icon: "h3",
    group: "style",
    shortcut: "###",
    aliases: ["h3", "heading", "заголовок"],
    run: (e) => e.chain().setBlockType("heading", { level: 3 }).run(),
  },
  {
    kind: "bulletList",
    label: "slash.bulletList",
    icon: "bullet",
    group: "style",
    shortcut: "-",
    aliases: ["ul", "bullet", "list", "список", "маркированный"],
    run: (e) => e.chain().setBulletList().run(),
  },
  {
    kind: "orderedList",
    label: "slash.orderedList",
    icon: "numbered",
    group: "style",
    shortcut: "1.",
    aliases: ["ol", "numbered", "ordered", "нумерованный"],
    run: (e) => e.chain().setOrderedList().run(),
  },
  {
    kind: "todoList",
    label: "slash.todoList",
    icon: "todo",
    group: "style",
    shortcut: "[]",
    aliases: ["todo", "task", "checkbox", "задачи", "задача", "чеклист"],
    run: (e) => e.chain().setTodoList().run(),
  },
  {
    kind: "quote",
    label: "slash.quote",
    icon: "quote",
    group: "style",
    shortcut: ">",
    aliases: ["quote", "blockquote", "цитата"],
    run: (e) => e.chain().setBlockType("blockquote").run(),
  },
  {
    kind: "code",
    label: "slash.code",
    icon: "code",
    group: "style",
    shortcut: "```",
    aliases: ["code", "snippet", "код"],
    run: (e) => e.chain().setBlockType("codeBlock", { language: "" }).run(),
  },
  {
    kind: "table",
    label: "slash.table",
    icon: "table",
    group: "insert",
    aliases: ["table", "grid", "таблица"],
    run: (e) => e.chain().insertTable({ rows: 3, cols: 3, withHeader: true }).run(),
  },
  {
    kind: "divider",
    label: "slash.divider",
    icon: "divider",
    group: "insert",
    shortcut: "---",
    aliases: ["divider", "hr", "line", "разделитель", "линия"],
    run: (e) => insertLeaf(e, "divider", {}),
  },
  {
    kind: "callout",
    label: "slash.callout",
    icon: "callout",
    group: "insert",
    aliases: ["callout", "note", "alert", "выноска", "заметка"],
    run: (e) => e.chain().setBlockType("callout", { type: "note", emoji: "" }).run(),
  },
];

/** The core's icon name of each page icon, so the shared slash menu draws it (Atlas frame 7). */
const SLASH_ICONS: Partial<Record<PageIconName, string>> = {
  image: "image",
  file: "paperclip",
  text: "type",
  h1: "heading-1",
  h2: "heading-2",
  h3: "heading-3",
  bullet: "list",
  numbered: "list-ordered",
  todo: "check-square",
  quote: "quote",
  code: "code",
  table: "table",
  divider: "minus",
  callout: "alert-circle",
};

/** Groups of the slash menu in display order (the shared menu's own): Style, Insert, Upload. */
export function pageSlashGroups(host: I18n): { id: string; label: string }[] {
  const i18n = withBlockEditorStrings(host);
  return [
    { id: "style", label: i18n.t("slashMenu.group.style") },
    { id: "insert", label: i18n.t("slashMenu.group.insert") },
    { id: "upload", label: i18n.t("slashMenu.group.upload") },
  ];
}

/** The page editor's blocks, localized. */
export function pageBlockCommands(host: I18n, kinds?: PageBlockKind[]): PageBlockCommand[] {
  const i18n = withBlockEditorStrings(host);
  const allowed = kinds ? new Set(kinds) : null;
  return SPECS.filter((s) => !allowed || allowed.has(s.kind)).map((s) => ({
    name: i18n.t(s.label),
    aliases: [s.kind, ...s.aliases],
    icon: SLASH_ICONS[s.icon] ?? s.icon,
    pageIcon: s.icon,
    shortcut: s.shortcut,
    group: s.group as SlashCommandDef["group"],
    execute: s.run,
  }));
}

/** Runs a page block command by kind (for a toolbar “blocks” button). */
export function insertPageBlock(editor: GoTipeEditor, kind: PageBlockKind): boolean {
  const spec = SPECS.find((s) => s.kind === kind);
  if (!spec) return false;
  spec.run(editor);
  return true;
}
