import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import type { I18n, TranslationKey } from "@gotipe/i18n";
import type { PageIconName } from "./icons";

/** A block the page editor can insert (the «/» menu and the blocks button). */
export interface PageBlockCommand extends SlashCommandDef {
  /** Icon of the row. */
  pageIcon: PageIconName;
  /** Markdown shortcut shown on the right of the row («#», «-», «```»). */
  shortcut?: string;
}

export type PageBlockKind =
  | "image"
  | "file"
  | "agent"
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
  group: "media" | "basic";
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
    group: "media",
    aliases: ["image", "img", "picture", "картинка", "изображение", "фото"],
    run: (e) => insertLeaf(e, "image", { src: "", alt: "", caption: "" }),
  },
  {
    kind: "file",
    label: "slash.file",
    icon: "file",
    group: "media",
    aliases: ["file", "attachment", "файл", "вложение"],
    run: (e) => insertLeaf(e, "file", { url: "", name: "" }),
  },
  {
    kind: "agent",
    label: "slash.agentInstructions",
    icon: "agent",
    group: "basic",
    aliases: ["agent", "instructions", "агент", "инструкции"],
    run: (e) => e.chain().setBlockType("callout", { type: "agent", emoji: "" }).run(),
  },
  {
    kind: "text",
    label: "slash.text",
    icon: "text",
    group: "basic",
    aliases: ["text", "paragraph", "текст", "абзац"],
    run: (e) => e.chain().setBlockType("paragraph").run(),
  },
  {
    kind: "heading1",
    label: "slash.heading1",
    icon: "h1",
    group: "basic",
    shortcut: "#",
    aliases: ["h1", "heading", "title", "заголовок"],
    run: (e) => e.chain().setBlockType("heading", { level: 1 }).run(),
  },
  {
    kind: "heading2",
    label: "slash.heading2",
    icon: "h2",
    group: "basic",
    shortcut: "##",
    aliases: ["h2", "heading", "subtitle", "заголовок"],
    run: (e) => e.chain().setBlockType("heading", { level: 2 }).run(),
  },
  {
    kind: "heading3",
    label: "slash.heading3",
    icon: "h3",
    group: "basic",
    shortcut: "###",
    aliases: ["h3", "heading", "заголовок"],
    run: (e) => e.chain().setBlockType("heading", { level: 3 }).run(),
  },
  {
    kind: "bulletList",
    label: "slash.bulletList",
    icon: "bullet",
    group: "basic",
    shortcut: "-",
    aliases: ["ul", "bullet", "list", "список", "маркированный"],
    run: (e) => e.chain().setBulletList().run(),
  },
  {
    kind: "orderedList",
    label: "slash.orderedList",
    icon: "numbered",
    group: "basic",
    shortcut: "1.",
    aliases: ["ol", "numbered", "ordered", "нумерованный"],
    run: (e) => e.chain().setOrderedList().run(),
  },
  {
    kind: "todoList",
    label: "slash.todoList",
    icon: "todo",
    group: "basic",
    shortcut: "[]",
    aliases: ["todo", "task", "checkbox", "задачи", "задача", "чеклист"],
    run: (e) => e.chain().setTodoList().run(),
  },
  {
    kind: "quote",
    label: "slash.quote",
    icon: "quote",
    group: "basic",
    shortcut: ">",
    aliases: ["quote", "blockquote", "цитата"],
    run: (e) => e.chain().setBlockType("blockquote").run(),
  },
  {
    kind: "code",
    label: "slash.code",
    icon: "code",
    group: "basic",
    shortcut: "```",
    aliases: ["code", "snippet", "код"],
    run: (e) => e.chain().setBlockType("codeBlock", { language: "" }).run(),
  },
  {
    kind: "table",
    label: "slash.table",
    icon: "table",
    group: "basic",
    aliases: ["table", "grid", "таблица"],
    run: (e) => e.chain().insertTable({ rows: 3, cols: 3, withHeader: true }).run(),
  },
  {
    kind: "divider",
    label: "slash.divider",
    icon: "divider",
    group: "basic",
    shortcut: "---",
    aliases: ["divider", "hr", "line", "разделитель", "линия"],
    run: (e) => insertLeaf(e, "divider", {}),
  },
  {
    kind: "callout",
    label: "slash.callout",
    icon: "callout",
    group: "basic",
    aliases: ["callout", "note", "alert", "выноска", "заметка"],
    run: (e) => e.chain().setBlockType("callout", { type: "note", emoji: "" }).run(),
  },
];

/** Groups of the «/» menu in display order (v6: «Медиа», «Основные»). */
export function pageSlashGroups(i18n: I18n): { id: string; label: string }[] {
  return [
    { id: "media", label: i18n.t("slash.group.media") },
    { id: "basic", label: i18n.t("slash.group.basic") },
  ];
}

/** The page editor's blocks, localized. */
export function pageBlockCommands(i18n: I18n, kinds?: PageBlockKind[]): PageBlockCommand[] {
  const allowed = kinds ? new Set(kinds) : null;
  return SPECS.filter((s) => !allowed || allowed.has(s.kind)).map((s) => ({
    name: i18n.t(s.label),
    aliases: [s.kind, ...s.aliases],
    icon: s.icon,
    pageIcon: s.icon,
    shortcut: s.shortcut,
    group: s.group as SlashCommandDef["group"],
    execute: s.run,
  }));
}

/** Runs a page block command by kind (for a toolbar «blocks» button). */
export function insertPageBlock(editor: GoTipeEditor, kind: PageBlockKind): boolean {
  const spec = SPECS.find((s) => s.kind === kind);
  if (!spec) return false;
  spec.run(editor);
  return true;
}
