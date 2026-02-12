import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useRef } from "react";

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

export function BlockContextMenu({ editor, blockId, open, onClose }: BlockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleDelete = useCallback(() => {
    editor.chain().deleteBlock(blockId).run();
    onClose();
  }, [editor, blockId, onClose]);

  const handleDuplicate = useCallback(() => {
    editor.chain().duplicateBlock(blockId).run();
    onClose();
  }, [editor, blockId, onClose]);

  const handleResetFormatting = useCallback(() => {
    editor.chain().setBlockType("paragraph").run();
    onClose();
  }, [editor, onClose]);

  const handleCopyToClipboard = useCallback(async () => {
    const state = editor.getViewState();
    const block = state.blocks.find((b) => b.id === blockId);
    if (block) {
      const text = Array.isArray(block.content)
        ? block.content.map((s) => s.text).join("")
        : (block.content ?? "");
      await navigator.clipboard.writeText(text);
    }
    onClose();
  }, [editor, blockId, onClose]);

  const items: MenuItem[] = [
    { label: "Delete", icon: "🗑", action: handleDelete, destructive: true },
    { label: "Duplicate", icon: "⧉", action: handleDuplicate },
    { label: "Reset Formatting", icon: "↺", action: handleResetFormatting },
    { label: "Copy to Clipboard", icon: "⎘", action: handleCopyToClipboard },
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
        </button>
      ))}
    </div>
  );
}
