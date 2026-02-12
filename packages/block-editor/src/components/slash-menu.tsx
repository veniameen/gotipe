import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface SlashMenuProps {
  editor: GoTipeEditor;
  commands?: SlashCommandDef[];
}

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.startsWith(q)) return 100;
  if (t.includes(q)) return 80;
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

export function SlashMenu({ editor, commands = [] }: SlashMenuProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = commands
    .filter((cmd) => !cmd.shouldShow || cmd.shouldShow(editor))
    .map((cmd) => ({
      cmd,
      score: query ? fuzzyScore(query, cmd.name) + fuzzyScore(query, cmd.aliases.join(" ")) : 100,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.cmd);

  const grouped = new Map<string, SlashCommandDef[]>();
  for (const cmd of filtered) {
    const group = cmd.group ?? "basic";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)?.push(cmd);
  }

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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].execute(editor);
          setVisible(false);
        }
      } else if (e.key === "Escape") {
        setVisible(false);
      }
    },
    [visible, filtered, selectedIndex, editor],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  return (
    <div
      ref={menuRef}
      className="gotipe-slash-menu"
      role="listbox"
      tabIndex={0}
      aria-label="Insert block"
      style={{ position: "fixed", top: `${position.top}px`, left: `${position.left}px` }}
    >
      {Array.from(grouped.entries()).map(([group, cmds]) => (
        <div key={group}>
          <div className="gotipe-slash-menu-group-label">{group}</div>
          {cmds.map((cmd, _i) => (
            <div
              key={cmd.name}
              className={`gotipe-slash-menu-item ${filtered.indexOf(cmd) === selectedIndex ? "selected" : ""}`}
              role="option"
              tabIndex={0}
              aria-selected={filtered.indexOf(cmd) === selectedIndex}
              onClick={() => {
                cmd.execute(editor);
                setVisible(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  cmd.execute(editor);
                  setVisible(false);
                }
              }}
            >
              <span className="gotipe-slash-menu-item-icon">{cmd.icon}</span>
              <div>
                <div>{cmd.name}</div>
                {cmd.description && (
                  <div style={{ fontSize: "0.8em", color: "var(--gt-text-muted)" }}>
                    {cmd.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{ padding: "8px 12px", color: "var(--gt-text-muted)" }}>No results</div>
      )}
    </div>
  );
}
