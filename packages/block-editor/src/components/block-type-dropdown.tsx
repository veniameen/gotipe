import type { GoTipeEditor } from "@gotipe/core";
import { useEditorState } from "@gotipe/react";
import { blockPath } from "./formatting/selection";
import { useFormattingMenu } from "./formatting/use-formatting-menu";

export interface BlockTypeDropdownProps {
  editor: GoTipeEditor;
}
interface BlockTypeOption {
  type: string;
  label: string;
  icon: string;
  attrs?: Record<string, unknown>;
}
const BLOCK_TYPES: BlockTypeOption[] = [
  { type: "paragraph", label: "Paragraph", icon: "Aa" },
  { type: "heading", label: "Heading 1", icon: "H1", attrs: { level: 1 } },
  { type: "heading", label: "Heading 2", icon: "H2", attrs: { level: 2 } },
  { type: "heading", label: "Heading 3", icon: "H3", attrs: { level: 3 } },
  { type: "bulletList", label: "Bullet List", icon: "•" },
  { type: "orderedList", label: "Numbered List", icon: "1." },
  { type: "todoList", label: "Todo List", icon: "☑" },
  { type: "blockquote", label: "Quote", icon: "“" },
  { type: "codeBlock", label: "Code", icon: "</>" },
];
export function BlockTypeDropdown({ editor }: BlockTypeDropdownProps) {
  const state = useEditorState(editor, (value) => value) ?? editor.getViewState();
  const menu = useFormattingMenu(editor);
  const path = blockPath(state.blocks, state.selection.anchor.blockId);
  const block = path.at(-1);
  const structuralCell = !!block && ["tableCell", "tableHeader"].includes(block.type);
  const list = [...path]
    .reverse()
    .find((item) => ["bulletList", "orderedList", "todoList"].includes(item.type));
  const label =
    block?.type === "heading"
      ? `Heading ${block.attrs.level ?? 1}`
      : (BLOCK_TYPES.find((option) => option.type === (list?.type ?? block?.type))?.label ??
        "Paragraph");
  const select = (option: BlockTypeOption) => {
    if (label === option.label) {
      menu.close();
      return;
    }
    menu.run((chain) => {
      if (option.type === "bulletList") chain.toggleBulletList();
      else if (option.type === "orderedList") chain.toggleOrderedList();
      else if (option.type === "todoList") chain.toggleTodoList();
      else chain.setBlockType(option.type, option.attrs);
    });
  };
  return (
    <div>
      <button
        ref={menu.trigger}
        type="button"
        className="gotipe-block-type-trigger"
        disabled={!menu.editable || structuralCell}
        onClick={() => (menu.open ? menu.close() : menu.show())}
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        aria-label="Change block type"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            menu.show();
            requestAnimationFrame(() =>
              menu.popup.current?.querySelector<HTMLButtonElement>("button")?.focus(),
            );
          }
        }}
      >
        <span className="gotipe-block-type-trigger-label">{label}</span>
        <span className="gotipe-block-type-trigger-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {menu.open && (
        <div
          ref={menu.popup}
          className="gotipe-block-type-dropdown"
          role="listbox"
          aria-label="Block types"
          data-gotipe-block-type-dropdown=""
          data-gotipe-formatting-popup=""
          style={menu.style}
          onKeyDown={menu.keydown}
        >
          {BLOCK_TYPES.map((option) => (
            <button
              key={option.label}
              type="button"
              role="option"
              className={option.label === label ? "active" : ""}
              aria-selected={option.label === label}
              data-block-type={option.type}
              data-level={option.attrs?.level}
              onClick={() => select(option)}
            >
              <span style={{ width: 20, textAlign: "center", flexShrink: 0 }}>{option.icon}</span>
              {option.label}
            </button>
          ))}
          {menu.error && <p role="alert">{menu.error}</p>}
        </div>
      )}
    </div>
  );
}
