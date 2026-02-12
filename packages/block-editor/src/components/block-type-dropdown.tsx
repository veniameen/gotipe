import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";

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
  { type: "bulletList", label: "Bullet List", icon: "\u2022" },
  { type: "numberedList", label: "Numbered List", icon: "1." },
  { type: "todoList", label: "Todo List", icon: "\u2611" },
  { type: "blockquote", label: "Quote", icon: "\u201C" },
  { type: "codeBlock", label: "Code", icon: "</>" },
];

function getCurrentBlockLabel(editor: GoTipeEditor): string {
  const state = editor.getViewState();
  const { anchor } = state.selection;
  const block = state.blocks.find((b) => b.id === anchor.blockId);
  if (!block) return "Paragraph";
  if (block.type === "heading") {
    const level = (block.attrs as Record<string, unknown>)?.level;
    return `Heading ${level ?? 1}`;
  }
  const match = BLOCK_TYPES.find((bt) => bt.type === block.type && !bt.attrs);
  return match?.label ?? "Paragraph";
}

export function BlockTypeDropdown({ editor }: BlockTypeDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLabel = getCurrentBlockLabel(editor);

  const handleSelect = useCallback(
    (option: BlockTypeOption) => {
      if (option.attrs) {
        editor.chain().setBlockType(option.type, option.attrs).run();
      } else {
        editor.chain().setBlockType(option.type).run();
      }
      setOpen(false);
    },
    [editor],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="gotipe-block-type-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change block type"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          height: "32px",
          padding: "0 8px",
          border: "none",
          borderRadius: "var(--gt-radius-lg, 12px)",
          background: "transparent",
          color: "var(--gt-text-secondary)",
          fontSize: "var(--gt-text-sm, 14px)",
          fontWeight: 500,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {currentLabel}
        <span style={{ fontSize: "10px" }}>{"\u25BE"}</span>
      </button>

      {open && (
        <div className="gotipe-block-type-dropdown" role="listbox" data-gotipe-block-type-dropdown="">
          {BLOCK_TYPES.map((option) => {
            const isActive =
              option.label === currentLabel ||
              (option.type === "paragraph" && currentLabel === "Paragraph");
            return (
              <button
                key={option.label}
                type="button"
                role="option"
                className={isActive ? "active" : ""}
                aria-selected={isActive}
                data-block-type={option.type}
                data-level={option.attrs?.level}
                onClick={() => handleSelect(option)}
              >
                <span style={{ width: "20px", textAlign: "center", flexShrink: 0 }}>
                  {option.icon}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
