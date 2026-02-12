import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface SlashMenuProps {
  editor: GoTipeEditor;
  commands?: SlashCommandDef[];
}

const GROUP_ORDER: SlashCommandDef["group"][] = ["ai", "style", "insert", "upload"];

const GROUP_LABELS: Record<string, string> = {
  ai: "AI",
  style: "Style",
  insert: "Insert",
  upload: "Upload",
};

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
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setQuery("");
      setSelectedIndex(0);
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setPosition({ top: rect.bottom + 4, left: rect.left });
      }
    });
    return unsub;
  }, [editor]);

  // Focus input on open
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [visible]);

  // Viewport edge detection — adjust position after render
  useLayoutEffect(() => {
    if (!visible || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { top, left } = position;
    if (rect.right > vw - 16) left = vw - rect.width - 16;
    if (rect.bottom > vh - 16) top = position.top - rect.height - 8;
    if (left < 16) left = 16;
    if (top < 16) top = 16;
    if (top !== position.top || left !== position.left) {
      setPosition({ top, left });
    }
  }, [visible, position]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible]);

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
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatItems[selectedIndex];
        if (item) {
          item.execute(editor);
          setVisible(false);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setVisible(false);
      }
    },
    [visible, flatItems, selectedIndex, editor],
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
      role="listbox"
      aria-label="Insert block"
      data-gotipe-slash-menu=""
      style={{ position: "fixed", top: `${position.top}px`, left: `${position.left}px` }}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        className="gotipe-slash-menu-search"
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        aria-label="Search blocks"
      />

      {/* Grouped items */}
      {grouped.map((group, gi) => (
        <div key={group.group}>
          {gi > 0 && <div className="gotipe-bubble-menu-separator" style={{ width: "100%", height: "1px", margin: "4px 0" }} />}
          <div className="gotipe-slash-menu-group-label">{group.label}</div>
          {group.items.map((cmd) => {
            const idx = flatIdx++;
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={cmd.name}
                className={`gotipe-slash-menu-item ${isSelected ? "selected" : ""}`}
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                data-gotipe-slash-item=""
                onClick={() => {
                  cmd.execute(editor);
                  setVisible(false);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="gotipe-slash-menu-item-icon">{cmd.icon}</span>
                <div>
                  <div className="gotipe-slash-menu-item-title">
                    {highlightMatch(cmd.name, query)}
                  </div>
                  {cmd.description && (
                    <div className="gotipe-slash-menu-item-description">
                      {cmd.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Empty state */}
      {flatItems.length === 0 && (
        <div className="gotipe-slash-menu-empty">No results</div>
      )}
    </div>
  );
}
