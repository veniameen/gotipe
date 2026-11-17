import type { GoTipeEditor, ViewState } from "@gotipe/core";
import { useEditorState } from "@gotipe/react";
import type { ReactNode } from "react";
import { BlockTypeDropdown } from "../components/block-type-dropdown";
import { BLOCK_KEYS, HISTORY_KEYS, MARK_KEYS } from "../components/formatting/keys";
import { LinkEditor } from "../components/formatting/link-editor";
import { useEditReason, useFormatReason } from "../components/formatting/reasons";
import { blockPath } from "../components/formatting/selection";
import { TextColorPicker } from "../components/text-color-picker";
import { useBlockEditorI18n } from "../i18n/strings";
import type { PageIconName } from "../page/icons";
import { AlignPicker } from "../text/align";
import { FontFamilyPicker, FontSizeStepper } from "../text/font";
import { InvisiblesToggle } from "../text/invisibles";
import { InsertMenu } from "./insert-menu";
import type { ToolUnit } from "./overflow";
import { hasFontMarks, hasInvisibles } from "./support";
import { ToolButton, runTool } from "./tool-button";

/** Tools a host may leave out of the fixed toolbar; `lists` covers the task list too. */
export type FixedToolbarTool =
  | "history"
  | "blockType"
  | "font"
  | "marks"
  | "align"
  | "lists"
  | "insert"
  | "invisibles";

/**
 * The bar of Atlas frame 31 in its order. When it is too narrow, ¶ leaves first, then the font,
 * “Insert”, the alignment with the task list, the rest of the marks and the lists; history, the
 * block type, bold, italic and underline stay.
 */
const UNITS: (ToolUnit & { tool: FixedToolbarTool })[] = [
  { id: "history", tool: "history", group: "history", priority: Number.POSITIVE_INFINITY },
  { id: "blockType", tool: "blockType", group: "blockType", priority: Number.POSITIVE_INFINITY },
  { id: "font", tool: "font", group: "font", priority: 2 },
  { id: "marks", tool: "marks", group: "marks", priority: Number.POSITIVE_INFINITY },
  { id: "moreMarks", tool: "marks", group: "marks", priority: 5 },
  { id: "align", tool: "align", group: "blocks", priority: 4 },
  { id: "lists", tool: "lists", group: "blocks", priority: 6 },
  { id: "todo", tool: "lists", group: "blocks", priority: 4 },
  { id: "insert", tool: "insert", group: "insert", priority: 3 },
  { id: "invisibles", tool: "invisibles", group: "end", priority: 1, end: true },
];

/** Host tools stand at the bar's edge, after ¶ and “More”, and never leave the bar. */
const HOST: ToolUnit = {
  id: "host",
  group: "end",
  priority: Number.POSITIVE_INFINITY,
  end: true,
};

/** The units this editor can show: fonts and ¶ need their extensions. */
export function toolUnits(
  editor: GoTipeEditor,
  hide: readonly FixedToolbarTool[],
  host: boolean,
): ToolUnit[] {
  const units: ToolUnit[] = UNITS.filter(
    (unit) =>
      !hide.includes(unit.tool) &&
      (unit.tool !== "font" || hasFontMarks(editor)) &&
      (unit.tool !== "invisibles" || hasInvisibles(editor)),
  );
  if (host) units.push(HOST);
  return units;
}

type Chain = ReturnType<GoTipeEditor["chain"]>;
const LISTS = ["bulletList", "orderedList", "todoList"];

/** The list the caret is in, the innermost one. */
function listOf(state: ViewState): string | null {
  const path = blockPath(state.blocks, state.selection.anchor.blockId);
  return [...path].reverse().find((block) => LISTS.includes(block.type))?.type ?? null;
}

function HistoryTools({ editor }: { editor: GoTipeEditor }) {
  const i18n = useBlockEditorI18n();
  const edit = useEditReason(editor);
  const can = useEditorState(editor, (state) => {
    const { canUndo, canRedo } = state.toolbar;
    return `${canUndo ? "u" : ""}${canRedo ? "r" : ""}`;
  });
  return (
    <>
      <ToolButton
        icon="undo"
        label={i18n.t("toolbar.undo")}
        binding={HISTORY_KEYS.undo}
        reason={edit ?? (can?.includes("u") ? null : i18n.t("toolbar.nothingToUndo"))}
        onRun={() => runTool(editor, (chain) => chain.undo())}
        data={{ "data-history": "undo" }}
      />
      <ToolButton
        icon="redo"
        label={i18n.t("toolbar.redo")}
        binding={HISTORY_KEYS.redo}
        reason={edit ?? (can?.includes("r") ? null : i18n.t("toolbar.nothingToRedo"))}
        onRun={() => runTool(editor, (chain) => chain.redo())}
        data={{ "data-history": "redo" }}
      />
    </>
  );
}

/** The marks with a button of their own; highlight is in the colour picker, link in its tool. */
type MarkName = Exclude<keyof typeof MARK_KEYS, "highlight" | "link">;
const MARK_TOOLS: Record<"marks" | "moreMarks", { mark: MarkName; icon: PageIconName }[]> = {
  marks: [
    { mark: "bold", icon: "bold" },
    { mark: "italic", icon: "italic" },
    { mark: "underline", icon: "underline" },
  ],
  moreMarks: [
    { mark: "strikethrough", icon: "strike" },
    { mark: "code", icon: "inlineCode" },
  ],
};

function MarkTools({ editor, set }: { editor: GoTipeEditor; set: "marks" | "moreMarks" }) {
  const i18n = useBlockEditorI18n();
  const reason = useFormatReason(editor);
  const active = useEditorState(editor, (state) => state.toolbar.activeMarks.join(" ")) ?? "";
  const on = new Set(active.split(" "));
  return (
    <>
      {MARK_TOOLS[set].map(({ mark, icon }) => (
        <ToolButton
          key={mark}
          icon={icon}
          label={i18n.t(`toolbar.${mark}`)}
          binding={MARK_KEYS[mark]}
          pressed={on.has(mark)}
          reason={reason}
          onRun={() => runTool(editor, (chain) => chain.toggleMark(mark))}
          data={{ "data-mark": mark }}
        />
      ))}
    </>
  );
}

const LIST_TOOLS: {
  type: string;
  icon: PageIconName;
  label: "toolbar.bulletList" | "toolbar.orderedList" | "toolbar.todoList";
  toggle: (chain: Chain) => void;
}[] = [
  {
    type: "bulletList",
    icon: "bullet",
    label: "toolbar.bulletList",
    toggle: (c) => c.toggleBulletList(),
  },
  {
    type: "orderedList",
    icon: "numbered",
    label: "toolbar.orderedList",
    toggle: (c) => c.toggleOrderedList(),
  },
  { type: "todoList", icon: "todo", label: "toolbar.todoList", toggle: (c) => c.toggleTodoList() },
];

function ListTools({ editor, types }: { editor: GoTipeEditor; types: string[] }) {
  const i18n = useBlockEditorI18n();
  const reason = useEditReason(editor);
  const list = useEditorState(editor, listOf) ?? null;
  return (
    <>
      {LIST_TOOLS.filter((tool) => types.includes(tool.type)).map((tool) => (
        <ToolButton
          key={tool.type}
          icon={tool.icon}
          label={i18n.t(tool.label)}
          binding={BLOCK_KEYS[tool.type]}
          pressed={list === tool.type}
          reason={reason}
          onRun={() => runTool(editor, tool.toggle)}
          data={{ "data-list": tool.type }}
        />
      ))}
    </>
  );
}

/** The tools of each unit; `host` is what the host put at the end. */
export function UnitTools({
  unit,
  editor,
  host,
}: {
  unit: string;
  editor: GoTipeEditor;
  host?: ReactNode;
}) {
  switch (unit) {
    case "history":
      return <HistoryTools editor={editor} />;
    case "blockType":
      return <BlockTypeDropdown editor={editor} lists={false} />;
    case "font":
      return (
        <>
          <FontFamilyPicker editor={editor} />
          <FontSizeStepper editor={editor} />
        </>
      );
    case "marks":
      return <MarkTools editor={editor} set="marks" />;
    case "moreMarks":
      return (
        <>
          <MarkTools editor={editor} set="moreMarks" />
          <LinkEditor editor={editor} />
          <TextColorPicker editor={editor} />
        </>
      );
    case "align":
      return <AlignPicker editor={editor} />;
    case "lists":
      return <ListTools editor={editor} types={["bulletList", "orderedList"]} />;
    case "todo":
      return <ListTools editor={editor} types={["todoList"]} />;
    case "insert":
      return <InsertMenu editor={editor} />;
    case "invisibles":
      return <InvisiblesToggle editor={editor} />;
    case "host":
      return <>{host}</>;
    default:
      return null;
  }
}
