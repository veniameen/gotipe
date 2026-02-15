import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface SlashMenuProps {
  editor: GoTipeEditor;
  commands?: SlashCommandDef[];
}

const GROUP_ORDER: SlashCommandDef["group"][] = ["ai", "style", "insert", "upload"];
const MENU_OFFSET_Y = 8;
const VIEWPORT_PADDING = 12;
const MAX_CARET_RECT_WIDTH = 48;
const LIST_CONTAINER_TYPES = new Set(["bulletList", "orderedList", "todoList"]);
const LIST_ITEM_TYPES = new Set(["listItem", "todoItem"]);

const GROUP_LABELS: Record<string, string> = {
  ai: "AI",
  style: "Style",
  insert: "Insert",
  upload: "Upload",
};

const ICON_TEXT_TOKENS = new Set(["heading-1", "heading-2", "heading-3"]);

type SlashTrigger = {
  blockId: string;
  from: number;
  to: number;
  query: string;
};

type ViewBlock = ReturnType<GoTipeEditor["getViewState"]>["blocks"][number];

function findBlockById(
  blocks: ReturnType<GoTipeEditor["getViewState"]>["blocks"],
  blockId: string,
): ReturnType<GoTipeEditor["getViewState"]>["blocks"][number] | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    if (block.children.length > 0) {
      const nested = findBlockById(block.children, blockId);
      if (nested) return nested;
    }
  }
  return null;
}

function blockContainsId(block: ViewBlock, blockId: string): boolean {
  if (block.id === blockId) return true;
  for (const child of block.children) {
    if (blockContainsId(child, blockId)) return true;
  }
  return false;
}

function findTopLevelIndexByBlockId(
  blocks: ReturnType<GoTipeEditor["getViewState"]>["blocks"],
  blockId: string,
): number | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blockContainsId(blocks[i]!, blockId)) return i;
  }
  return null;
}

function resolveCaretBlock(block: ViewBlock): ViewBlock {
  if (
    LIST_CONTAINER_TYPES.has(block.type) &&
    block.children.length > 0
  ) {
    return resolveCaretBlock(block.children[0]!);
  }
  return block;
}

function getBlockTextLength(block: ViewBlock): number {
  if (Array.isArray(block.content)) {
    return block.content.reduce((sum, span) => sum + span.text.length, 0);
  }
  if (typeof block.content === "string") {
    return block.content.length;
  }
  return 0;
}

function setDomCaretInBlock(blockId: string, targetOffset: number): boolean {
  const block = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
  const sel = window.getSelection();
  if (!block || !sel) return false;
  const blockType = block.getAttribute("data-block-type");
  const todoTextHost =
    blockType === "todoItem"
      ? (block.querySelector("[data-gotipe-todo-content]") as HTMLElement | null)
      : null;

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let targetNode: Text | null = null;
  let localOffset = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const text = node as Text;
    const len = (text.textContent ?? "").length;
    targetNode = text;
    if (acc + len >= targetOffset) {
      localOffset = Math.max(0, Math.min(len, targetOffset - acc));
      break;
    }
    acc += len;
    localOffset = len;
  }

  const range = document.createRange();
  if (targetNode) {
    range.setStart(targetNode, localOffset);
  } else if (todoTextHost) {
    // Keep caret after checkbox for empty todo items (no text nodes yet).
    range.setStart(todoTextHost, 0);
  } else {
    range.setStart(block, 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

function getSlashTrigger(editor: GoTipeEditor): SlashTrigger | null {
  const state = editor.getViewState();
  const sel = state.selection;
  if (sel.type !== "text" || !sel.anchor.blockId) return null;
  if (sel.anchor.blockId !== sel.head.blockId || sel.anchor.offset !== sel.head.offset) return null;

  const block = findBlockById(state.blocks, sel.anchor.blockId);
  if (!block || !Array.isArray(block.content)) return null;

  const text = block.content.map((span) => span.text).join("");
  const caret = Math.max(0, Math.min(sel.anchor.offset, text.length));
  const beforeCaret = text.slice(0, caret);
  const slashIdx = beforeCaret.lastIndexOf("/");
  if (slashIdx === -1) return null;

  if (slashIdx > 0 && !/\s/.test(beforeCaret[slashIdx - 1] ?? "")) return null;

  const rawQuery = beforeCaret.slice(slashIdx + 1);
  if (/\s/.test(rawQuery)) return null;

  return {
    blockId: sel.anchor.blockId,
    from: slashIdx,
    to: caret,
    query: rawQuery,
  };
}

function isUsableRect(rect: DOMRect | null): rect is DOMRect {
  if (!rect) return false;
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return false;
  return rect.width > 0 || rect.height > 0;
}

function isCaretLikeRect(rect: DOMRect | null): rect is DOMRect {
  if (!isUsableRect(rect)) return false;
  return rect.width <= MAX_CARET_RECT_WIDTH;
}

function getBlockElementFromNode(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const anchorEl = node instanceof Element ? node : node.parentElement;
  return (anchorEl?.closest("[data-block-id]") as HTMLElement | null) ?? null;
}

function getTextHostForBlock(blockEl: HTMLElement): HTMLElement {
  const blockType = blockEl.getAttribute("data-block-type");
  if (blockType === "todoItem") {
    return (blockEl.querySelector("[data-gotipe-todo-content]") as HTMLElement | null) ?? blockEl;
  }
  if (blockType === "callout") {
    return (blockEl.querySelector(".gotipe-callout-content") as HTMLElement | null) ?? blockEl;
  }
  return blockEl;
}

function getPreviousCharacterRect(range: Range, blockEl: HTMLElement): DOMRect | null {
  try {
    const probe = document.createRange();
    probe.setStart(blockEl, 0);
    probe.setEnd(range.startContainer, range.startOffset);
    const absoluteOffset = probe.toString().length;
    if (absoluteOffset <= 0) return null;

    const textHost = getTextHostForBlock(blockEl);
    const walker = document.createTreeWalker(textHost, NodeFilter.SHOW_TEXT);
    let accumulated = 0;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const textNode = node as Text;
      const len = (textNode.textContent ?? "").length;
      if (len === 0) continue;
      if (accumulated + len >= absoluteOffset) {
        const localEnd = Math.min(len, absoluteOffset - accumulated);
        const localStart = Math.max(0, localEnd - 1);
        const charRange = document.createRange();
        charRange.setStart(textNode, localStart);
        charRange.setEnd(textNode, localEnd);
        const rect = charRange.getBoundingClientRect();
        return isUsableRect(rect) ? rect : null;
      }
      accumulated += len;
    }
  } catch {
    // Continue with anchor fallbacks when range endpoints are stale.
  }
  return null;
}

function getRangeCaretRect(collapsedRange: Range): DOMRect | null {
  const blockEl = getBlockElementFromNode(collapsedRange.startContainer);

  const rects = Array.from(collapsedRange.getClientRects());
  const lastRect = rects.length > 0 ? rects[rects.length - 1]! : null;
  if (isCaretLikeRect(lastRect)) return lastRect;

  const collapsedRect = collapsedRange.getBoundingClientRect();
  if (isCaretLikeRect(collapsedRect)) return collapsedRect;

  if (blockEl) {
    const prevRect = getPreviousCharacterRect(collapsedRange, blockEl);
    if (isUsableRect(prevRect)) return prevRect;

    const anchorRect = blockEl.getBoundingClientRect();
    if (isUsableRect(anchorRect)) return anchorRect;
  }

  return null;
}

function resolveDomPointInBlock(blockEl: HTMLElement, targetOffset: number): { node: Node; offset: number } {
  const textHost = getTextHostForBlock(blockEl);
  const walker = document.createTreeWalker(textHost, NodeFilter.SHOW_TEXT);
  let accumulated = 0;
  let lastTextNode: Node | null = null;
  let textNode: Node | null;

  while ((textNode = walker.nextNode())) {
    lastTextNode = textNode;
    const len = (textNode.textContent ?? "").length;
    if (accumulated + len >= targetOffset) {
      return { node: textNode, offset: Math.min(Math.max(0, targetOffset - accumulated), len) };
    }
    accumulated += len;
  }

  if (!lastTextNode) {
    return { node: textHost, offset: 0 };
  }

  const lastLen = (lastTextNode.textContent ?? "").length;
  return { node: lastTextNode, offset: lastLen };
}

function getCaretClientRectFromTrigger(trigger: SlashTrigger | null): DOMRect | null {
  if (!trigger) return null;
  const blockEl = document.querySelector(`[data-block-id="${trigger.blockId}"]`) as HTMLElement | null;
  if (!blockEl) return null;
  const point = resolveDomPointInBlock(blockEl, trigger.to);
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  return getRangeCaretRect(range);
}

function getCaretClientRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const collapsed = selection.getRangeAt(0).cloneRange();
  collapsed.collapse(true);
  return getRangeCaretRect(collapsed);
}

function renderIcon(icon: string, name: string): React.ReactNode {
  const key = icon.toLowerCase();

  if (ICON_TEXT_TOKENS.has(key)) {
    return <span className="gotipe-slash-menu-item-icon-text">{key.replace("heading-", "H")}</span>;
  }

  if (key === "sparkles" || key === "sparkle") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }

  if (key === "type") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 6h14M12 6v12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "list") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="5" cy="7" r="1.2" fill="currentColor" />
        <circle cx="5" cy="12" r="1.2" fill="currentColor" />
        <circle cx="5" cy="17" r="1.2" fill="currentColor" />
        <path d="M9 7h10M9 12h10M9 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "list-ordered") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h2V5M6 7V5M4 12h2M4 17h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9 7h10M9 12h10M9 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "check-square") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="4" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M4.8 7.4l1.6 1.6L8.9 6.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 7h8M13 12h8M13 17h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "quote") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 5v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10 7h9M10 12h7M10 17h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "code") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M10 9l-2.5 3L10 15M14 9l2.5 3-2.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (key === "table") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3.5 10h17M3.5 15h17M9 4v16M15 4v16" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (key === "minus") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "image") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="4" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="8.5" cy="9" r="1.7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 17l4.5-4 3.5 3 3-2.5 2.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (key === "paperclip") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9.5 12.5l5.9-5.9a3 3 0 114.2 4.2l-7.8 7.8a5 5 0 11-7.1-7.1l7.1-7.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  const fallback = name.trim().charAt(0).toUpperCase() || "•";
  return <span className="gotipe-slash-menu-item-icon-text">{fallback}</span>;
}

function isAccentIcon(icon: string, name: string): boolean {
  const key = icon.toLowerCase();
  if (key === "sparkles" || key === "sparkle") return true;
  return name.toLowerCase().includes("ai");
}

/* ------------------------------------------------------------------ */
/*  Fuzzy search with scoring                                         */
/* ------------------------------------------------------------------ */

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(q)) return 100; // exact prefix
  if (t.includes(q)) return 80; // substring
  // character-by-character fuzzy
  let qi = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

function scoreCommand(query: string, cmd: SlashCommandDef): number {
  if (!query) return 100;
  const nameScore = fuzzyScore(query, cmd.name);
  const aliasScore = Math.max(0, ...cmd.aliases.map((a) => fuzzyScore(query, a)));
  // exact prefix on name wins, then alias match, then fuzzy substring
  return Math.max(nameScore, aliasScore * 0.9);
}

/* ------------------------------------------------------------------ */
/*  Highlight matching chars with <mark>                              */
/* ------------------------------------------------------------------ */

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) {
    return (
      <>
        {text.slice(0, idx)}
        <mark>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }
  // character-by-character highlight
  const chars: React.ReactNode[] = [];
  let qi = 0;
  for (let i = 0; i < text.length; i++) {
    if (qi < q.length && t[i] === q[qi]) {
      chars.push(<mark key={i}>{text[i]}</mark>);
      qi++;
    } else {
      chars.push(text[i]);
    }
  }
  return <>{chars}</>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function SlashMenu({ editor, commands = [] }: SlashMenuProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [anchorPosition, setAnchorPosition] = useState({ top: 120, left: 120 });
  const [position, setPosition] = useState({ top: 120, left: 120 });
  const menuRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef("");
  const triggerRef = useRef<SlashTrigger | null>(null);

  // Filter & score
  const filtered = useMemo(() => {
    return commands
      .filter((cmd) => !cmd.shouldShow || cmd.shouldShow(editor))
      .map((cmd) => ({ cmd, score: scoreCommand(query, cmd) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.cmd);
  }, [commands, query, editor]);

  // Group by category in defined order
  const grouped = useMemo(() => {
    const map = new Map<string, SlashCommandDef[]>();
    for (const cmd of filtered) {
      const group = cmd.group ?? "style";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(cmd);
    }
    // Return in GROUP_ORDER, skipping empty groups
    const result: Array<{ group: string; label: string; items: SlashCommandDef[] }> = [];
    for (const g of GROUP_ORDER) {
      const items = map.get(g);
      if (items && items.length > 0) {
        result.push({ group: g, label: GROUP_LABELS[g] ?? g, items });
      }
    }
    return result;
  }, [filtered]);

  // Flat list for keyboard navigation index
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Open handler
  useEffect(() => {
    const unsub = editor.on("openSlashMenu", () => {
      setVisible(true);
      const trigger = getSlashTrigger(editor);
      triggerRef.current = trigger;
      const nextQuery = trigger?.query ?? "";
      setQuery(nextQuery);
      queryRef.current = nextQuery;
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        const caretRect = getCaretClientRectFromTrigger(trigger) ?? getCaretClientRect();
        const next = caretRect
          ? { top: caretRect.bottom + MENU_OFFSET_Y, left: caretRect.left }
          : {
              top: Math.max(VIEWPORT_PADDING, Math.round(window.innerHeight * 0.28)),
              left: Math.max(VIEWPORT_PADDING, Math.round(window.innerWidth * 0.22)),
            };
        setAnchorPosition(next);
        setPosition(next);
      });
    });
    return unsub;
  }, [editor]);

  useEffect(() => {
    if (!visible) return;

    const syncFromEditor = () => {
      const trigger = getSlashTrigger(editor);
      if (!trigger) {
        if (!triggerRef.current) {
          setVisible(false);
        }
        return;
      }
      triggerRef.current = trigger;

      if (queryRef.current !== trigger.query) {
        queryRef.current = trigger.query;
        setQuery(trigger.query);
        setSelectedIndex(0);
      }

      const caretRect = getCaretClientRectFromTrigger(trigger) ?? getCaretClientRect();
      if (caretRect) {
        setAnchorPosition({ top: caretRect.bottom + MENU_OFFSET_Y, left: caretRect.left });
      }
    };

    syncFromEditor();
    const unsubUpdate = editor.on("update", syncFromEditor);
    const unsubSelection = editor.on("selectionChange", syncFromEditor);
    return () => {
      unsubUpdate();
      unsubSelection();
    };
  }, [editor, visible]);

  // Viewport edge detection — adjust position after render
  useLayoutEffect(() => {
    if (!visible || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxLeft = vw - rect.width - VIEWPORT_PADDING;
    const left = Math.min(Math.max(anchorPosition.left, VIEWPORT_PADDING), Math.max(VIEWPORT_PADDING, maxLeft));

    const spaceBelow = vh - anchorPosition.top - VIEWPORT_PADDING;
    const spaceAbove = anchorPosition.top - VIEWPORT_PADDING;
    let top = anchorPosition.top;
    if (spaceBelow < rect.height && spaceAbove > spaceBelow) {
      top = anchorPosition.top - rect.height - MENU_OFFSET_Y;
    }
    const maxTop = vh - rect.height - VIEWPORT_PADDING;
    top = Math.min(Math.max(top, VIEWPORT_PADDING), Math.max(VIEWPORT_PADDING, maxTop));

    setPosition((prev) => {
      if (Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5) return prev;
      return { top, left };
    });
  }, [anchorPosition, grouped.length, query, visible]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        e.preventDefault();
        setVisible(false);
        triggerRef.current = null;
        editor.focus();
        requestAnimationFrame(() => {
          editor.focus();
        });
      }
    };
    document.addEventListener("mousedown", handleClick, true);
    return () => document.removeEventListener("mousedown", handleClick, true);
  }, [editor, visible]);

  // Execute a slash command: delete "/" trigger text, then run the command
  const executeCommand = useCallback(
    (cmd: SlashCommandDef) => {
      const beforeState = editor.getViewState();
      const trigger = getSlashTrigger(editor) ?? triggerRef.current;
      const fallbackAnchorBlockId = trigger?.blockId ?? beforeState.selection.anchor.blockId;
      const fallbackTopLevelIndex = findTopLevelIndexByBlockId(beforeState.blocks, fallbackAnchorBlockId);
      const fallbackBlockBefore = findBlockById(beforeState.blocks, fallbackAnchorBlockId);
      if (trigger && trigger.to > trigger.from) {
        editor.dispatch({
          steps: [{ type: "deleteText", blockId: trigger.blockId, from: trigger.from, to: trigger.to }],
        });
        editor.setSelection({
          anchor: { blockId: trigger.blockId, offset: trigger.from },
          head: { blockId: trigger.blockId, offset: trigger.from },
        });
      }
      cmd.execute(editor);

      // Normalize caret after structural commands (e.g. paragraph -> list/todo).
      // Always resolve to an existing, text-editable block to avoid native caret drift.
      const state = editor.getViewState();
      const selection = state.selection.type === "text" ? state.selection : null;
      let targetBlock: ViewBlock | null = selection
        ? findBlockById(state.blocks, selection.anchor.blockId)
        : null;
      let targetOffset = selection?.anchor.offset ?? 0;
      const selectionNeedsFallback =
        !targetBlock || LIST_CONTAINER_TYPES.has(targetBlock.type);
      let normalizedSelection: { blockId: string; offset: number } | null = null;

      if (selectionNeedsFallback && fallbackBlockBefore && fallbackTopLevelIndex !== null) {
        if (LIST_ITEM_TYPES.has(fallbackBlockBefore.type)) {
          const mappedItem = findBlockById(state.blocks, fallbackAnchorBlockId);
          if (mappedItem) {
            targetBlock = mappedItem;
          } else if (state.blocks.length > 0) {
            // listItem/todoItem was lifted out from its list container to a new top-level block
            const sameIndex = state.blocks[Math.min(fallbackTopLevelIndex, state.blocks.length - 1)] ?? null;
            if (sameIndex) {
              targetBlock =
                LIST_CONTAINER_TYPES.has(sameIndex.type)
                  ? (state.blocks[fallbackTopLevelIndex + 1] ?? sameIndex)
                  : sameIndex;
              targetOffset = 0;
            }
          }
        } else if (
          LIST_CONTAINER_TYPES.has(fallbackBlockBefore.type) &&
          state.blocks.length > 0
        ) {
          // Some DOM selection paths report the list container instead of the active item.
          // Detect if one child was lifted out and move caret to the inserted sibling block.
          const sameIndex = state.blocks[Math.min(fallbackTopLevelIndex, state.blocks.length - 1)] ?? null;
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

      if (selectionNeedsFallback && !targetBlock && fallbackTopLevelIndex !== null && state.blocks.length > 0) {
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
        normalizedSelection = { blockId: caretBlock.id, offset };
      }

      if (selectionNeedsFallback && targetBlock) {
        const caretBlock = resolveCaretBlock(targetBlock);
        const maxOffset = getBlockTextLength(caretBlock);
        const offset = Math.max(0, Math.min(targetOffset, maxOffset));
        editor.setSelection({
          anchor: { blockId: caretBlock.id, offset },
          head: { blockId: caretBlock.id, offset },
        });
        normalizedSelection = { blockId: caretBlock.id, offset };
      }
      editor.focus();

      setVisible(false);
      triggerRef.current = null;
      queryRef.current = "";
      setQuery("");
      setSelectedIndex(0);

      if (normalizedSelection) {
        const plannedSelection = normalizedSelection;
        requestAnimationFrame(() => {
          // Do not override caret if user already typed/moved selection.
          // This prevents first-character reordering right after slash command execution.
          const live = editor.getViewState().selection;
          if (live.type === "text") {
            const moved =
              live.anchor.blockId !== plannedSelection.blockId ||
              live.head.blockId !== plannedSelection.blockId ||
              live.anchor.offset !== plannedSelection.offset ||
              live.head.offset !== plannedSelection.offset;
            if (moved) return;
          }

          setDomCaretInBlock(plannedSelection.blockId, plannedSelection.offset);
          editor.syncSelectionFromDOM?.();
          editor.setSelection({
            anchor: { blockId: plannedSelection.blockId, offset: plannedSelection.offset },
            head: { blockId: plannedSelection.blockId, offset: plannedSelection.offset },
          });
          editor.focus();
        });
      }
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
    [visible, flatItems, selectedIndex, executeCommand],
  );

  // Global keydown for keyboard nav when menu is open
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => handleKeyDown(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (!visible || !menuRef.current) return;
    const selected = menuRef.current.querySelector(".gotipe-slash-menu-item.selected");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, visible]);

  if (!visible) return null;

  let flatIdx = 0;

  return (
    <div
      ref={menuRef}
      className="gotipe-slash-menu"
      role="dialog"
      aria-label="Insert block"
      data-gotipe-slash-menu=""
      style={{ position: "fixed", top: `${position.top}px`, left: `${position.left}px` }}
      onMouseDown={(e) => {
        // Keep focus/selection in editor while interacting with the menu.
        e.preventDefault();
      }}
    >
      {/* Grouped items */}
      <div id="gotipe-slash-menu-list" className="gotipe-slash-menu-list" role="listbox" aria-label="Commands">
      {grouped.map((group, gi) => (
        <div key={group.group} role="group" aria-label={group.label}>
          {gi > 0 && <div className="gotipe-slash-menu-group-separator" role="separator" />}
          <div className="gotipe-slash-menu-group-label" aria-hidden="true">{group.label}</div>
          {group.items.map((cmd) => {
            const idx = flatIdx++;
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={cmd.name}
                id={`gotipe-slash-item-${idx}`}
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
                  {renderIcon(cmd.icon, cmd.name)}
                </span>
                <div className="gotipe-slash-menu-item-body">
                  <div className="gotipe-slash-menu-item-title">
                    {highlightMatch(cmd.name, query)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Empty state */}
      {flatItems.length === 0 && (
        <div className="gotipe-slash-menu-empty" role="status">No results</div>
      )}
      </div>

      {/* Live region for screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="gotipe-sr-only">
        {flatItems.length > 0 ? `${flatItems.length} results available` : "No results"}
      </div>
    </div>
  );
}
