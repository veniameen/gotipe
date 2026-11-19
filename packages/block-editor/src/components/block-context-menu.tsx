import { type GoTipeEditor, GoTipeError } from "@gotipe/core";
import type { TranslationKey } from "@gotipe/i18n";
import { useFloatingPosition } from "@gotipe/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlockEditorI18n } from "../i18n/strings";
import { deleteMenuBlock, duplicateMenuBlock, resetMenuBlock } from "../interaction/block-actions";
import { copyBlockLink } from "../interaction/block-link";
import { isHostKey } from "../page/host-slot";
import { PageIcon, type PageIconName } from "../page/icons";
import { BLOCK_KEYS } from "./formatting/keys";
import { MenuKey } from "./formatting/tip";

export interface BlockContextMenuProps {
  editor: GoTipeEditor;
  /** The block the actions apply to; on a list, pass the row (`BlockToolbar` does). */
  blockId: string;
  open: boolean;
  onClose: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  icon: PageIconName;
  action: () => void;
  destructive?: boolean;
}

type ViewBlock = ReturnType<GoTipeEditor["getViewState"]>["blocks"][number];

type TurnIntoOption = {
  label: string;
  icon: PageIconName;
  type: string;
  attrs?: Record<string, unknown>;
};

const LIST_TYPES = new Set(["bulletList", "orderedList", "todoList"]);

/** The names shown for the menu's English labels. */
const NAMES: Record<string, TranslationKey> = {
  Text: "slashMenu.text",
  "Heading 1": "slashMenu.heading1",
  "Heading 2": "slashMenu.heading2",
  "Heading 3": "slashMenu.heading3",
  "Bullet List": "toolbar.bulletList",
  "Numbered List": "toolbar.orderedList",
  "To-do List": "toolbar.todoList",
  Blockquote: "block.blockquote",
  "Code Block": "toolbar.codeBlock",
  "Copy link to block": "block.copyLink",
  Duplicate: "block.duplicate",
  "Reset Formatting": "block.resetFormatting",
  "Copy to Clipboard": "block.copy",
  Delete: "block.delete",
};

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

/**
 * A menu not measured yet waits hidden at the screen's corner, where it has the whole width: the
 * theme's own offsets would put a fixed panel past the screen's edge and measure it there.
 */
const UNMEASURED = { left: 0, top: 0 };

export function BlockContextMenu({ editor, blockId, open, onClose }: BlockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const submenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const i18n = useBlockEditorI18n();
  const nameOf = (label: string) => (NAMES[label] ? i18n.t(NAMES[label]) : label);
  const anchor = useCallback(
    () => menuRef.current?.parentElement?.getBoundingClientRect() ?? null,
    [],
  );
  const submenuAnchor = useCallback(
    () => submenuTriggerRef.current?.getBoundingClientRect() ?? null,
    [],
  );
  const position = useFloatingPosition({ open, element: menuRef, anchor });
  // “Turn into” follows its menu: the menu moves without resizing, the trigger moves with it (D-267)
  const submenuPosition = useFloatingPosition({
    open: open && turnIntoOpen,
    element: submenuRef,
    anchor: submenuAnchor,
    placement: "left-start",
    gap: 0,
    revision: position,
  });

  const turnIntoOptions = useMemo<TurnIntoOption[]>(
    () => [
      { label: "Text", icon: "text", type: "paragraph" },
      { label: "Heading 1", icon: "h1", type: "heading", attrs: { level: 1 } },
      { label: "Heading 2", icon: "h2", type: "heading", attrs: { level: 2 } },
      { label: "Heading 3", icon: "h3", type: "heading", attrs: { level: 3 } },
      { label: "Bullet List", icon: "bullet", type: "bulletList" },
      { label: "Numbered List", icon: "numbered", type: "orderedList" },
      { label: "To-do List", icon: "todo", type: "todoList" },
      { label: "Blockquote", icon: "quote", type: "blockquote" },
      { label: "Code Block", icon: "code", type: "codeBlock" },
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
    deleteMenuBlock(editor, blockId);
    setTurnIntoOpen(false);
    onClose();
  }, [editor, blockId, onClose]);

  const handleDuplicate = useCallback(() => {
    duplicateMenuBlock(editor, blockId);
    setTurnIntoOpen(false);
    onClose();
  }, [editor, blockId, onClose]);

  const handleResetFormatting = useCallback(() => {
    const target = resolveTransformTarget();
    if (target) resetMenuBlock(editor, target.id, target.offset);
    editor.focus();
    setTurnIntoOpen(false);
    onClose();
  }, [editor, onClose, resolveTransformTarget]);

  // the same link a heading's anchor copies; a refused clipboard is the editor's error
  const handleCopyBlockLink = useCallback(async () => {
    await copyBlockLink(editor, blockId, i18n.t("media.clipboardUnavailable"));
    setTurnIntoOpen(false);
    onClose();
  }, [editor, blockId, i18n, onClose]);

  const handleCopyToClipboard = useCallback(async () => {
    const state = editor.getViewState();
    const block = findBlockById(state.blocks, blockId);
    if (block) {
      const textOf = (node: ViewBlock): string =>
        [
          Array.isArray(node.content)
            ? node.content.map((span) => span.text).join("")
            : (node.content ?? ""),
          ...node.children.map(textOf),
        ]
          .filter(Boolean)
          .join("\n");
      const text = textOf(block);
      await navigator.clipboard.writeText(text);
    }
    setTurnIntoOpen(false);
    onClose();
  }, [editor, blockId, onClose]);

  const items: MenuItem[] = [
    { key: "copy-link", label: "Copy link to block", icon: "link", action: handleCopyBlockLink },
    { key: "duplicate", label: "Duplicate", icon: "duplicate", action: handleDuplicate },
    {
      key: "reset-formatting",
      label: "Reset Formatting",
      icon: "restore",
      action: handleResetFormatting,
    },
    {
      key: "copy-clipboard",
      label: "Copy to Clipboard",
      icon: "copy",
      action: handleCopyToClipboard,
    },
    { key: "delete", label: "Delete", icon: "trash", action: handleDelete, destructive: true },
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
      if (e.key === "Escape" && !isHostKey(e)) {
        e.preventDefault();
        if (turnIntoOpen) setTurnIntoOpen(false);
        else {
          menuRef.current?.parentElement
            ?.querySelector<HTMLButtonElement>("[data-gotipe-drag-handle]")
            ?.focus({ preventScroll: true });
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, turnIntoOpen]);

  // Keyboard navigation within menu
  useEffect(() => {
    if (!open || !menuRef.current) return;
    const firstItem = menuRef.current.querySelector<HTMLButtonElement>("[role=menuitem]");
    firstItem?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setTurnIntoOpen(false);
    }
  }, [open]);

  if (!open) return null;

  const runAction = async (action: () => void) => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      const error = new GoTipeError(
        "TRANSFORM_ERROR",
        cause instanceof Error ? cause.message : i18n.t("block.actionFailed"),
      );
      setError(error.message);
      editor.reportError(error);
    }
  };

  const handleMenuItemArrowNavigation = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!menuRef.current) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const menuItems = Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'),
    );
    const currentIndex = menuItems.indexOf(event.currentTarget);
    if (currentIndex === -1 || menuItems.length === 0) return;
    const nextIndex =
      event.key === "ArrowDown"
        ? Math.min(menuItems.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1);
    menuItems[nextIndex]?.focus();
  };

  return (
    <div
      ref={menuRef}
      className="gotipe-block-context-menu"
      role="menu"
      aria-label={i18n.t("block.handle")}
      data-gotipe-context-menu=""
      style={{
        ...(position ?? UNMEASURED),
        position: "fixed",
        visibility: position ? "visible" : "hidden",
        overflowY: "auto",
      }}
    >
      <div
        className="gotipe-context-item-has-submenu"
        onMouseEnter={() => setTurnIntoOpen(true)}
        onMouseLeave={() => setTurnIntoOpen(false)}
      >
        <button
          ref={submenuTriggerRef}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={turnIntoOpen}
          onClick={() => setTurnIntoOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setTurnIntoOpen(true);
              const firstSubmenuItem = menuRef.current?.querySelector<HTMLButtonElement>(
                '[data-turn-into-item="true"]',
              );
              firstSubmenuItem?.focus();
              return;
            }
            handleMenuItemArrowNavigation(e);
          }}
        >
          <span className="gotipe-context-menu-icon" aria-hidden="true">
            <PageIcon name="swap" />
          </span>
          <span className="gotipe-context-menu-label">{i18n.t("block.turnInto")}</span>
          <span className="gotipe-context-menu-chevron" aria-hidden="true">
            <PageIcon name="chevronRight" />
          </span>
        </button>
        {turnIntoOpen ? (
          <div
            ref={submenuRef}
            className="gotipe-context-submenu"
            role="menu"
            aria-label={i18n.t("block.turnInto")}
            style={{
              ...(submenuPosition ?? UNMEASURED),
              position: "fixed",
              visibility: submenuPosition ? "visible" : "hidden",
              overflowY: "auto",
            }}
          >
            {turnIntoOptions.map((option) => (
              <button
                key={option.label}
                type="button"
                role="menuitem"
                data-turn-into-item="true"
                onClick={() => void runAction(() => applyTurnInto(option))}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    setTurnIntoOpen(false);
                    const trigger = menuRef.current?.querySelector<HTMLButtonElement>(
                      ".gotipe-context-item-has-submenu > button[role='menuitem']",
                    );
                    trigger?.focus();
                    return;
                  }
                  handleMenuItemArrowNavigation(e);
                }}
              >
                <span className="gotipe-context-menu-icon" aria-hidden="true">
                  <PageIcon name={option.icon} />
                </span>
                <span className="gotipe-context-menu-label">{nameOf(option.label)}</span>
                <MenuKey
                  binding={
                    BLOCK_KEYS[
                      option.type === "heading" ? `heading:${option.attrs?.level}` : option.type
                    ]
                  }
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {items.map((item) => [
        item.destructive ? (
          <div key={`${item.key}-separator`} className="gotipe-context-menu-separator" />
        ) : null,
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={item.destructive ? "destructive" : undefined}
          onClick={() => void runAction(item.action)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setTurnIntoOpen(false);
              return;
            }
            handleMenuItemArrowNavigation(e);
          }}
        >
          <span className="gotipe-context-menu-icon" aria-hidden="true">
            <PageIcon name={item.icon} />
          </span>
          <span className="gotipe-context-menu-label">{nameOf(item.label)}</span>
        </button>,
      ])}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
