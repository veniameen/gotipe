import type { SlashCommandDef } from "@gotipe/core";
import type { BlockEditorTranslationKey, I18n } from "@gotipe/i18n";
import { blockEditorEn } from "../../i18n/en";

/** Built-in commands by icon; a command is translated only when its name is the core's own. */
const COMMAND_NAMES: Record<string, BlockEditorTranslationKey> = {
  type: "slashMenu.text",
  "heading-1": "slashMenu.heading1",
  "heading-2": "slashMenu.heading2",
  "heading-3": "slashMenu.heading3",
  list: "slashMenu.bulletList",
  "list-ordered": "slashMenu.orderedList",
  "check-square": "slashMenu.todoList",
  quote: "slashMenu.blockquote",
  code: "slashMenu.codeBlock",
  table: "slashMenu.table",
  minus: "slashMenu.divider",
  image: "slashMenu.image",
  paperclip: "slashMenu.fileBlock",
  "alert-circle": "slashMenu.callout",
  "chevron-right": "slashMenu.toggle",
  columns: "slashMenu.columns",
  "external-link": "slashMenu.embed",
  "function-square": "slashMenu.math",
  smile: "slashMenu.emoji",
  function: "slashMenu.inlineMath",
};

/** The commands of `defineAiContext` (`@gotipe/ai`) by their English name; both draw the sparkle. */
const AI_COMMAND_NAMES: Record<string, BlockEditorTranslationKey> = {
  "Continue Writing": "slashMenu.continueWriting",
  "Ask AI": "slashMenu.askAi",
};

/**
 * A built-in command in the editor's language; its English name stays a search alias. A host's
 * own command, or one renamed by the host, keeps its name.
 */
export function localizeCommand(cmd: SlashCommandDef, i18n: I18n): SlashCommandDef {
  const key =
    COMMAND_NAMES[cmd.icon.toLowerCase()] ??
    (cmd.group === "ai" ? AI_COMMAND_NAMES[cmd.name] : undefined);
  if (!key || blockEditorEn[key] !== cmd.name) return cmd;
  const name = i18n.t(key);
  return name === cmd.name ? cmd : { ...cmd, name, aliases: [...cmd.aliases, cmd.name] };
}
