import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import { useFloatingPosition } from "@gotipe/react";
import type React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export interface SlashMenuProps {
  editor: GoTipeEditor;
  commands?: SlashCommandDef[];
  /** Group order and labels; groups not listed are hidden. Default: AI, Style, Insert, Upload. */
  groups?: { id: string; label: string }[];
  /** Custom row icon. */
  renderIcon?: (cmd: SlashCommandDef) => React.ReactNode;
  /** Right-hand meta of a row (e.g. a Markdown shortcut). */
  renderMeta?: (cmd: SlashCommandDef) => React.ReactNode;
  /** UI strings. */
  labels?: { menu?: string; list?: string; empty?: string; results?: (count: number) => string };
  className?: string;
}

import type { BlockEditorTranslationKey, TranslationKey } from "@gotipe/i18n";
import { blockEditorEn } from "../i18n/en";
import { useBlockEditorI18n } from "../i18n/strings";
import { getCaretClientRect, getCaretClientRectFromTrigger } from "./slash/caret";
import { useListOwner } from "./slash/combobox";
import { isAccentIcon, markdownShortcut, renderIcon } from "./slash/icons";
import {
  LIST_CONTAINER_TYPES,
  LIST_ITEM_TYPES,
  type SlashTrigger,
  type ViewBlock,
  findBlockById,
  findTopLevelIndexByBlockId,
  getBlockTextLength,
  getSlashTrigger,
  resolveCaretBlock,
} from "./slash/model";
import { highlightMatch, scoreCommand } from "./slash/search";

const GROUP_ORDER: SlashCommandDef["group"][] = ["ai", "style", "insert", "upload"];
const MENU_OFFSET_Y = 8;
const GROUP_LABELS: Record<string, TranslationKey> = {
  ai: "slashMenu.group.ai",
  style: "slashMenu.group.style",
  insert: "slashMenu.group.insert",
  upload: "slashMenu.group.upload",
};

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

export function SlashMenu({
  editor,
  commands = [],
  groups,
  renderIcon: renderIconProp,
  renderMeta,
  labels,
  className,
}: SlashMenuProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const queryRef = useRef("");
  const i18n = useBlockEditorI18n();
  // Built-in commands speak the editor's language; their English name stays a search alias.
  const localized = useMemo(
    () =>
      commands.map((cmd) => {
        const key = COMMAND_NAMES[cmd.icon.toLowerCase()];
        if (!key || blockEditorEn[key] !== cmd.name) return cmd;
        const name = i18n.t(key);
        return name === cmd.name ? cmd : { ...cmd, name, aliases: [...cmd.aliases, cmd.name] };
      }),
    [commands, i18n],
  );
  const triggerRef = useRef<SlashTrigger | null>(null);

  const anchor = useCallback(() => {
    return (
      getCaretClientRectFromTrigger(editor, triggerRef.current) ??
      getCaretClientRect(editor) ??
      editor.element?.getBoundingClientRect() ??
      null
    );
  }, [editor]);
  const position = useFloatingPosition({
    open: visible,
    anchor,
    element: menuRef,
    gap: MENU_OFFSET_Y,
    revision,
  });

  // Filter & score
  const filtered = useMemo(() => {
    return localized
      .filter((cmd) => !cmd.shouldShow || cmd.shouldShow(editor))
      .map((cmd) => ({ cmd, score: scoreCommand(query, cmd) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.cmd);
  }, [localized, query, editor]);

  // Group by category in defined order
  const grouped = useMemo(() => {
    const map = new Map<string, SlashCommandDef[]>();
    for (const cmd of filtered) {
      const group = cmd.group ?? "style";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(cmd);
    }
    // Return in group order, skipping empty groups
    const order =
      groups ??
      GROUP_ORDER.map((g) => ({ id: g, label: GROUP_LABELS[g] ? i18n.t(GROUP_LABELS[g]) : g }));
    const result: Array<{ group: string; label: string; items: SlashCommandDef[] }> = [];
    for (const g of order) {
      const items = map.get(g.id);
      if (items && items.length > 0) {
        result.push({ group: g.id, label: g.label, items });
      }
    }
    return result;
  }, [filtered, groups, i18n]);

  // Flat list for keyboard navigation index
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Open handler
  useEffect(() => {
    const unsub = editor.on("openSlashMenu", () => {
      if (!editor.isEditable) return;
      setVisible(true);
      const trigger = getSlashTrigger(editor);
      triggerRef.current = trigger;
      const nextQuery = trigger?.query ?? "";
      setQuery(nextQuery);
      queryRef.current = nextQuery;
      setSelectedIndex(0);
      setRevision((value) => value + 1);
    });
    return unsub;
  }, [editor]);

  useEffect(() => {
    if (!visible) return;

    const syncFromEditor = () => {
      const trigger = getSlashTrigger(editor);
      if (!editor.isEditable || (!trigger && triggerRef.current)) {
        setVisible(false);
        triggerRef.current = null;
        return;
      }
      if (!trigger) return;
      triggerRef.current = trigger;

      if (queryRef.current !== trigger.query) {
        queryRef.current = trigger.query;
        setQuery(trigger.query);
        setSelectedIndex(0);
      }

      setRevision((value) => value + 1);
    };

    syncFromEditor();
    const unsubUpdate = editor.on("update", syncFromEditor);
    const unsubSelection = editor.on("selectionChange", syncFromEditor);
    const unsubEditable = editor.on("editableChange", syncFromEditor);
    return () => {
      unsubUpdate();
      unsubSelection();
      unsubEditable();
    };
  }, [editor, visible]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false);
        triggerRef.current = null;
      }
    };
    document.addEventListener("mousedown", handleClick, true);
    return () => document.removeEventListener("mousedown", handleClick, true);
  }, [visible]);

  // Execute a slash command: delete "/" trigger text, then run the command
  const executeCommand = useCallback(
    (cmd: SlashCommandDef) => {
      const runBeforeEditorMutations = cmd.group === "upload";
      if (runBeforeEditorMutations) {
        cmd.execute(editor);
      }

      const beforeState = editor.getViewState();
      const trigger = getSlashTrigger(editor) ?? triggerRef.current;
      const fallbackAnchorBlockId = trigger?.blockId ?? beforeState.selection.anchor.blockId;
      const fallbackTopLevelIndex = findTopLevelIndexByBlockId(
        beforeState.blocks,
        fallbackAnchorBlockId,
      );
      const fallbackBlockBefore = findBlockById(beforeState.blocks, fallbackAnchorBlockId);
      if (trigger && trigger.to > trigger.from) {
        editor.dispatch({
          steps: [
            { type: "deleteText", blockId: trigger.blockId, from: trigger.from, to: trigger.to },
          ],
        });
        editor.setSelection({
          anchor: { blockId: trigger.blockId, offset: trigger.from },
          head: { blockId: trigger.blockId, offset: trigger.from },
        });
      }
      if (!runBeforeEditorMutations) {
        cmd.execute(editor);
      }

      // Normalize caret after structural commands (e.g. paragraph -> list/todo).
      // Always resolve to an existing, text-editable block to avoid native caret drift.
      const state = editor.getViewState();
      const selection = state.selection.type === "text" ? state.selection : null;
      let targetBlock: ViewBlock | null = selection
        ? findBlockById(state.blocks, selection.anchor.blockId)
        : null;
      let targetOffset = selection?.anchor.offset ?? 0;
      const selectionNeedsFallback = !targetBlock || LIST_CONTAINER_TYPES.has(targetBlock.type);

      if (selectionNeedsFallback && fallbackBlockBefore && fallbackTopLevelIndex !== null) {
        if (LIST_ITEM_TYPES.has(fallbackBlockBefore.type)) {
          const mappedItem = findBlockById(state.blocks, fallbackAnchorBlockId);
          if (mappedItem) {
            targetBlock = mappedItem;
          } else if (state.blocks.length > 0) {
            // listItem/todoItem was lifted out from its list container to a new top-level block
            const sameIndex =
              state.blocks[Math.min(fallbackTopLevelIndex, state.blocks.length - 1)] ?? null;
            if (sameIndex) {
              targetBlock = LIST_CONTAINER_TYPES.has(sameIndex.type)
                ? (state.blocks[fallbackTopLevelIndex + 1] ?? sameIndex)
                : sameIndex;
              targetOffset = 0;
            }
          }
        } else if (LIST_CONTAINER_TYPES.has(fallbackBlockBefore.type) && state.blocks.length > 0) {
          // Some DOM selection paths report the list container instead of the active item.
          // Detect if one child was lifted out and move caret to the inserted sibling block.
          const sameIndex =
            state.blocks[Math.min(fallbackTopLevelIndex, state.blocks.length - 1)] ?? null;
          const nextTopLevel = state.blocks[fallbackTopLevelIndex + 1] ?? null;
          if (
            sameIndex &&
            LIST_CONTAINER_TYPES.has(sameIndex.type) &&
            sameIndex.children.length < fallbackBlockBefore.children.length &&
            nextTopLevel
          ) {
            targetBlock = nextTopLevel;
            targetOffset = 0;
          }
        }
      }

      if (
        selectionNeedsFallback &&
        !targetBlock &&
        fallbackTopLevelIndex !== null &&
        state.blocks.length > 0
      ) {
        const idx = Math.min(fallbackTopLevelIndex, state.blocks.length - 1);
        targetBlock = state.blocks[idx] ?? null;
        targetOffset = 0;
      }

      if (selectionNeedsFallback && !targetBlock && state.blocks.length > 0) {
        targetBlock = state.blocks[0]!;
        targetOffset = 0;
      }

      // Normalize to a collapsed cursor even for non-structural transforms.
      // This prevents first typed character from replacing existing block text.
      if (!selectionNeedsFallback && targetBlock) {
        const caretBlock = resolveCaretBlock(targetBlock);
        const maxOffset = getBlockTextLength(caretBlock);
        const offset = Math.max(0, Math.min(targetOffset, maxOffset));
        editor.setSelection({
          anchor: { blockId: caretBlock.id, offset },
          head: { blockId: caretBlock.id, offset },
        });
      }

      if (selectionNeedsFallback && targetBlock) {
        const caretBlock = resolveCaretBlock(targetBlock);
        const maxOffset = getBlockTextLength(caretBlock);
        const offset = Math.max(0, Math.min(targetOffset, maxOffset));
        editor.setSelection({
          anchor: { blockId: caretBlock.id, offset },
          head: { blockId: caretBlock.id, offset },
        });
      }
      editor.focus();

      setVisible(false);
      triggerRef.current = null;
      queryRef.current = "";
      setQuery("");
      setSelectedIndex(0);
    },
    [editor],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      if (!visible) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        setSelectedIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setSelectedIndex(flatItems.length - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[selectedIndex];
        if (item) {
          executeCommand(item);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setVisible(false);
        triggerRef.current = null;
        editor.focus();
        requestAnimationFrame(() => {
          editor.focus();
        });
      }
    },
    [visible, flatItems, selectedIndex, executeCommand, editor],
  );

  // Global keydown for keyboard nav when menu is open
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => handleKeyDown(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, handleKeyDown]);

  // Scroll selected item into view
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the selected row changes
  useEffect(() => {
    if (!visible || !menuRef.current) return;
    const selected = menuRef.current.querySelector(".gotipe-slash-menu-item.selected");
    const list = menuRef.current.querySelector<HTMLElement>(".gotipe-slash-menu-list");
    if (selected && list) {
      const itemRect = selected.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
      else if (itemRect.bottom > listRect.bottom)
        list.scrollTop += itemRect.bottom - listRect.bottom;
    }
  }, [selectedIndex, visible]);

  useListOwner(
    editor,
    visible ? listId : null,
    visible && flatItems.length ? `${listId}-item-${selectedIndex}` : null,
  );
  if (!visible) return null;

  let flatIdx = 0;

  return (
    <div
      ref={menuRef}
      className={className ? `gotipe-slash-menu ${className}` : "gotipe-slash-menu"}
      role="dialog"
      aria-label={labels?.menu ?? i18n.t("slashMenu.menu")}
      data-gotipe-slash-menu=""
      style={{
        position: "fixed",
        ...position,
        maxHeight: Math.min(
          420,
          typeof position?.maxHeight === "number" ? position.maxHeight : 420,
        ),
        visibility: position ? "visible" : "hidden",
        overflow: "auto",
      }}
      onMouseDown={(e) => {
        // Keep focus/selection in editor while interacting with the menu.
        e.preventDefault();
      }}
    >
      {/* Grouped items */}
      <div
        id={listId}
        className="gotipe-slash-menu-list"
        role="listbox"
        aria-label={labels?.list ?? i18n.t("slashMenu.list")}
      >
        {grouped.map((group, gi) => (
          <div key={group.group} role="group" aria-label={group.label}>
            {gi > 0 && <hr className="gotipe-slash-menu-group-separator" />}
            <div className="gotipe-slash-menu-group-label" aria-hidden="true">
              {group.label}
            </div>
            {group.items.map((cmd) => {
              const idx = flatIdx++;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.name}
                  id={`${listId}-item-${idx}`}
                  className={`gotipe-slash-menu-item ${isSelected ? "selected" : ""}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={isSelected}
                  data-gotipe-slash-item=""
                  onMouseDown={(e) => {
                    // Keep focus in editor on click path.
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span
                    className={`gotipe-slash-menu-item-icon ${isAccentIcon(cmd.icon, cmd.name) ? "gotipe-slash-menu-item-icon--accent" : ""}`}
                    aria-hidden="true"
                  >
                    {renderIconProp ? renderIconProp(cmd) : renderIcon(cmd.icon, cmd.name)}
                  </span>
                  <div className="gotipe-slash-menu-item-body">
                    <div className="gotipe-slash-menu-item-title">
                      {highlightMatch(cmd.name, query)}
                    </div>
                  </div>
                  {renderMeta ? (
                    <span className="gotipe-slash-menu-item-meta" aria-hidden="true">
                      {renderMeta(cmd)}
                    </span>
                  ) : markdownShortcut(cmd.icon) ? (
                    <span className="gotipe-slash-menu-item-meta" aria-hidden="true">
                      {markdownShortcut(cmd.icon)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}

        {/* Empty state */}
        {flatItems.length === 0 && (
          <div className="gotipe-slash-menu-empty" role="status">
            {labels?.empty ?? i18n.t("slashMenu.empty")}
          </div>
        )}
      </div>

      {/* Live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="gotipe-sr-only">
        {flatItems.length > 0
          ? (labels?.results?.(flatItems.length) ??
            i18n.t("slashMenu.results", { count: flatItems.length }))
          : (labels?.empty ?? i18n.t("slashMenu.empty"))}
      </div>
    </div>
  );
}
