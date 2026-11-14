import type { BlockView, GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import type { TranslationKey } from "@gotipe/i18n";
import { useId } from "react";
import { useEditReason } from "../components/formatting/reasons";
import { Tip } from "../components/formatting/tip";
import { useFormattingMenu } from "../components/formatting/use-formatting-menu";
import { markdownShortcut, renderIcon } from "../components/slash/icons";
import { localizeCommand } from "../components/slash/names";
import { useBlockEditorI18n } from "../i18n/strings";
import { PageIcon } from "../page/icons";

/** Blocks «Insert» lists first, in this order (Atlas frame 31); other insert commands follow. */
const BLOCKS = ["quote", "alert-circle", "chevron-right", "code", "table", "minus"];
const MEDIA = ["image", "paperclip"];
/** Commands of «/» that turn the empty line into their block; «Insert» adds the block instead. */
const TURNS_INTO: Record<string, string> = { quote: "blockquote", code: "codeBlock" };
const GROUP_NAMES: Record<InsertGroup["id"], TranslationKey> = {
  insert: "slashMenu.group.insert",
  upload: "slashMenu.group.upload",
};

export interface InsertGroup {
  id: "insert" | "upload";
  items: SlashCommandDef[];
}

const iconOf = (cmd: SlashCommandDef) => cmd.icon.toLowerCase();
const rank = (order: string[], cmd: SlashCommandDef) => {
  const index = order.indexOf(iconOf(cmd));
  return index < 0 ? order.length : index;
};

/**
 * What «Insert» offers: the blocks and media of the editor's «/» commands. Text, headings and
 * lists have their own tools; a host's insert and upload commands follow the built-in ones.
 */
export function insertGroups(editor: GoTipeEditor, commands: SlashCommandDef[]): InsertGroup[] {
  const shown = commands.filter((cmd) => !cmd.shouldShow || cmd.shouldShow(editor));
  const blocks = shown
    .filter(
      (cmd) => cmd.group === "insert" || (cmd.group === "style" && BLOCKS.includes(iconOf(cmd))),
    )
    .sort((a, b) => rank(BLOCKS, a) - rank(BLOCKS, b));
  const media = shown
    .filter((cmd) => cmd.group === "upload")
    .sort((a, b) => rank(MEDIA, a) - rank(MEDIA, b));
  const groups: InsertGroup[] = [
    { id: "insert", items: blocks },
    { id: "upload", items: media },
  ];
  return groups.filter((group) => group.items.length > 0);
}

function flatten(blocks: BlockView[]): BlockView[] {
  return blocks.flatMap((block) => [block, ...flatten(block.children)]);
}

/**
 * Adds the command's block after the caret's block, as one undo step; on an empty line the
 * command takes the line, as from «/». The caret goes into the new block's text.
 */
export function runInsert(editor: GoTipeEditor, cmd: SlashCommandDef): void {
  const before = new Set(flatten(editor.getViewState().blocks).map((block) => block.id));
  const current = editor.getCurrentBlock();
  const type = TURNS_INTO[iconOf(cmd)];
  if (type && !(current?.type === "paragraph" && current.isEmpty))
    editor.chain().insertBlockAfter(type).run();
  else cmd.execute(editor);
  const added = flatten(editor.getViewState().blocks).find(
    (block) => !before.has(block.id) && block.content !== null,
  );
  if (added)
    editor.setSelection({
      anchor: { blockId: added.id, offset: 0 },
      head: { blockId: added.id, offset: 0 },
    });
  editor.focus();
}

/** «Insert» of the fixed toolbar: a list of the blocks and media «/» offers (Atlas frame 31). */
export function InsertMenu({ editor }: { editor: GoTipeEditor }) {
  const i18n = useBlockEditorI18n();
  const menu = useFormattingMenu(editor);
  const reason = useEditReason(editor);
  const tip = useId();
  const groups = menu.open
    ? insertGroups(
        editor,
        editor.getSlashCommands().map((cmd) => localizeCommand(cmd, i18n)),
      )
    : [];
  return (
    <div className="gotipe-format-anchor">
      <button
        ref={menu.trigger}
        type="button"
        className="gotipe-format-tool is-text"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-disabled={reason ? true : undefined}
        aria-describedby={reason ? tip : undefined}
        data-gotipe-insert=""
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (reason) return;
          if (menu.open) menu.close();
          else menu.show();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !menu.open && !reason) {
            event.preventDefault();
            menu.show();
          }
        }}
      >
        <PageIcon name="plus" />
        <span className="gotipe-format-tool-label">{i18n.t("toolbar.insert")}</span>
        <PageIcon name="chevron" />
        {reason ? <Tip id={tip} label={reason} /> : null}
      </button>
      {menu.open && (
        <div
          ref={menu.popup}
          className="gotipe-format-menu gotipe-insert-menu"
          role="menu"
          aria-label={i18n.t("toolbar.insert")}
          data-gotipe-formatting-popup=""
          style={menu.style}
          onKeyDown={menu.keydown}
        >
          {groups.map((group) => (
            <div
              key={group.id}
              className="gotipe-menu-group"
              role="group"
              aria-label={i18n.t(GROUP_NAMES[group.id])}
            >
              <span className="gotipe-menu-label" aria-hidden="true">
                {i18n.t(GROUP_NAMES[group.id])}
              </span>
              {group.items.map((cmd) => {
                const shortcut = markdownShortcut(cmd.icon);
                return (
                  <button
                    key={`${cmd.icon}:${cmd.name}`}
                    type="button"
                    role="menuitem"
                    data-insert={iconOf(cmd)}
                    onClick={() => menu.apply(() => runInsert(editor, cmd))}
                  >
                    {renderIcon(cmd.icon, cmd.name)}
                    <span className="gotipe-menu-text">{cmd.name}</span>
                    {shortcut ? (
                      <span className="gotipe-menu-key" aria-hidden="true">
                        {shortcut}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
          {menu.error && (
            <p role="alert" className="gotipe-sr-only">
              {menu.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
