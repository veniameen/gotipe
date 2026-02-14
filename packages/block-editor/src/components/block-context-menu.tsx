import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface BlockContextMenuProps {
  editor: GoTipeEditor;
  blockId: string;
  open: boolean;
  onClose: () => void;
}

interface MenuItem {
  label: string;
  icon: string;
  action: () => void;
  destructive?: boolean;
}

type ViewBlock = ReturnType<GoTipeEditor["getViewState"]>["blocks"][number];

type TurnIntoOption = {
  label: string;
  type: string;
  attrs?: Record<string, unknown>;
};

const LIST_TYPES = new Set(["bulletList", "orderedList", "todoList"]);

function findBlockById(blocks: ViewBlock[], targetId: string): ViewBlock | null {
  for (const block of blocks) {
    if (block.id === targetId) return block;
    if (block.children.length > 0) {
      const nested = findBlockById(block.children, targetId);
      if (nested) return nested;
    }
  }
  return null;
}

function blockContainsId(block: ViewBlock, targetId: string): boolean {
  if (block.id === targetId) return true;
  return block.children.some((child) => blockContainsId(child, targetId));
}

function getTextLength(block: ViewBlock): number {
  if (Array.isArray(block.content)) {
    return block.content.reduce((sum, span) => sum + span.text.length, 0);
  }
  if (typeof block.content === "string") return block.content.length;
  return 0;
}

export function BlockContextMenu({ editor, blockId, open, onClose }: BlockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);

  const turnIntoOptions = useMemo<TurnIntoOption[]>(
    () => [
      { label: "Text", type: "paragraph" },
      { label: "Heading 1", type: "heading", attrs: { level: 1 } },
      { label: "Heading 2", type: "heading", attrs: { level: 2 } },
      { label: "Heading 3", type: "heading", attrs: { level: 3 } },
      { label: "Bullet List", type: "bulletList" },
      { label: "Numbered List", type: "orderedList" },
      { label: "To-do List", type: "todoList" },
      { label: "Blockquote", type: "blockquote" },
      { label: "Code Block", type: "codeBlock" },
    ],
    [],
  );

  const resolveTransformTarget = useCallback((): { id: string; offset: number } | null => {
    const state = editor.getViewState();
    const rootBlock = findBlockById(state.blocks, blockId);
    if (!rootBlock) return null;

    let target = rootBlock;
    if (LIST_TYPES.has(rootBlock.type) && rootBlock.children.length > 0) {
      const selectedId = state.selection.anchor.blockId;
      const selectedInside = blockContainsId(rootBlock, selectedId)
        ? findBlockById([rootBlock], selectedId)
        : null;
      target = selectedInside ?? rootBlock.children[0]!;
    }

    const stateOffset =
      state.selection.anchor.blockId === target.id
        ? state.selection.anchor.offset
        : getTextLength(target);
    const maxOffset = getTextLength(target);
    return { id: target.id, offset: Math.max(0, Math.min(stateOffset, maxOffset)) };
  }, [editor, blockId]);

  const applyTurnInto = useCallback(
    (option: TurnIntoOption) => {
      const target = resolveTransformTarget();
      if (!target) return;

      editor.setSelection({
        anchor: { blockId: target.id, offset: target.offset },
        head: { blockId: target.id, offset: target.offset },
      });
      if (option.type === "bulletList") {
        editor.chain().toggleBulletList().run();
      } else if (option.type === "orderedList") {
        editor.chain().toggleOrderedList().run();
      } else if (option.type === "todoList") {
        editor.chain().toggleTodoList().run();
      } else {
        editor.chain().setBlockType(option.type, option.attrs).run();
      }
      editor.focus();
      setTurnIntoOpen(false);
      onClose();
    },
    [editor, onClose, resolveTransformTarget],
  );

  const handleDelete = useCallback(() => {
    editor.chain().deleteBlock(blockId).run();
    setTurnIntoOpen(false);
    onClose();
  }, [editor, blockId, onClose]);

  const handleDuplicate = useCallback(() => {
    editor.chain().duplicateBlock(blockId).run();
    setTurnIntoOpen(false);
    onClose();
  }, [editor, blockId, onClose]);

  const handleResetFormatting = useCallback(() => {
    applyTurnInto({ label: "Text", type: "paragraph" });
  }, [applyTurnInto]);

  const handleToggleTurnInto = useCallback(() => {
    setTurnIntoOpen((prev) => !prev);
  }, []);

  const handleCopyBlockLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.hash}#block-${blockId}`;
    await navigator.clipboard.writeText(url);
    setTurnIntoOpen(false);
    onClose();
  }, [blockId, onClose]);

  const handleCopyToClipboard = useCallback(async () => {
    const state = editor.getViewState();
    const block = findBlockById(state.blocks, blockId);
    if (block) {
      const text = Array.isArray(block.content)
        ? block.content.map((s) => s.text).join("")
        : (block.content ?? "");
      await navigator.clipboard.writeText(text);
    }
    setTurnIntoOpen(false);
    onClose();
  }, [editor, blockId, onClose]);

  const items: MenuItem[] = [
    { label: "Turn into", icon: "↹", action: handleToggleTurnInto },
    { label: "Copy link to block", icon: "🔗", action: handleCopyBlockLink },
    { label: "Duplicate", icon: "⧉", action: handleDuplicate },
    { label: "Reset Formatting", icon: "↺", action: handleResetFormatting },
    { label: "Copy to Clipboard", icon: "⎘", action: handleCopyToClipboard },
    { label: "Delete", icon: "🗑", action: handleDelete, destructive: true },
  ];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Keyboard navigation within menu
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const firstItem = menuRef.current.querySelector<HTMLButtonElement>("[role=menuitem]");
    firstItem?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTurnIntoOpen(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="gotipe-block-context-menu"
      role="menu"
      aria-label="Block actions"
      data-gotipe-context-menu=""
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={item.destructive ? "destructive" : undefined}
          onClick={item.action}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = e.currentTarget.nextElementSibling as HTMLButtonElement | null;
              next?.focus();
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              const prev = e.currentTarget.previousElementSibling as HTMLButtonElement | null;
              prev?.focus();
            }
          }}
        >
          <span className="gotipe-context-menu-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
          {item.label === "Turn into" ? (
            <span className="gotipe-context-menu-chevron" aria-hidden="true">
              {turnIntoOpen ? "▾" : "▸"}
            </span>
          ) : null}
        </button>
      ))}
      {turnIntoOpen ? (
        <div className="gotipe-context-submenu" role="group" aria-label="Turn into">
          {turnIntoOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitem"
              onClick={() => applyTurnInto(option)}
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
