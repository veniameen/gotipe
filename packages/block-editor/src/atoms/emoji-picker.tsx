import type { GoTipeEditor } from "@gotipe/core";
import {
  EMOJI_CATEGORIES,
  type EmojiCategory,
  emojiItems,
  findEmoji,
  searchEmoji,
} from "@gotipe/core/emoji";
import { type AtomTarget, toSafeImageSrc } from "@gotipe/core/extensions";
import type { TranslationKey } from "@gotipe/i18n";
import { useFloatingPosition } from "@gotipe/react";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCaretClientRectFromTrigger } from "../components/slash/caret";
import { useBlockEditorI18n } from "../i18n/strings";
import { focusLeaves, wrapTab } from "./dialog-focus";
import { emojiNames, loadEmojiNames } from "./emoji-names";
import { insertEmoji } from "./extensions";
import { type CustomEmojiItem, atomHost, recentEmoji } from "./host";
import { AtomIcon, type AtomIconName } from "./icons";

const COLUMNS = 9;
const TAB_ICONS: Record<EmojiCategory | "recent" | "custom", AtomIconName> = {
  recent: "clock",
  people: "smile",
  nature: "leaf",
  food: "cup",
  activities: "ball",
  travel: "pin",
  objects: "bulb",
  symbols: "heart",
  flags: "flag",
  custom: "image",
};

interface Cell {
  key: string;
  label: string;
  glyph: React.ReactNode;
  choice: { kind: "unicode"; emoji: string } | { kind: "custom"; item: CustomEmojiItem };
}
interface Section {
  id: EmojiCategory | "recent" | "custom" | "results";
  title: string;
  cells: Cell[];
}

function customCell(item: CustomEmojiItem): Cell {
  return {
    key: `:${item.name}:`,
    label: `:${item.name}:`,
    glyph: <img src={toSafeImageSrc(item.src) ?? undefined} alt="" draggable={false} />,
    choice: { kind: "custom", item },
  };
}

/** The sections of the picker: recent, the categories and the team's own, or search results. */
function useSections(editor: GoTipeEditor, query: string): Section[] {
  const i18n = useBlockEditorI18n();
  const { emoji } = atomHost(editor);
  const locale = i18n.locale;
  const [names, setNames] = useState(() => emojiNames(locale));
  useEffect(() => {
    let live = true;
    loadEmojiNames(locale).then((loaded) => {
      if (live) setNames(loaded);
    });
    return () => {
      live = false;
    };
  }, [locale]);
  return useMemo(() => {
    const unicode = (item: { name: string; emoji: string; category: EmojiCategory }): Cell => ({
      key: item.emoji,
      label: names?.[item.name] ?? item.name.replace(/_/g, " "),
      glyph: item.emoji,
      choice: { kind: "unicode", emoji: item.emoji },
    });
    const custom = emoji?.custom ?? [];
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      const cells = [
        ...searchEmoji(needle, COLUMNS * 8, names).map(unicode),
        ...custom.filter((item) => item.name.toLowerCase().includes(needle)).map(customCell),
      ];
      return [{ id: "results", title: i18n.t("emoji.picker"), cells }];
    }
    const own = new Map(custom.map((item) => [`:${item.name}:`, item]));
    const recent = recentEmoji(editor).flatMap((value): Cell[] => {
      const item = own.get(value);
      if (item) return [customCell(item)];
      const found = findEmoji(value);
      return found ? [unicode(found)] : [];
    });
    const sections: Section[] = [];
    if (recent.length)
      sections.push({ id: "recent", title: i18n.t("emoji.recent"), cells: recent });
    for (const category of EMOJI_CATEGORIES)
      sections.push({
        id: category,
        title: i18n.t(`emoji.category.${category}` as TranslationKey),
        cells: emojiItems(category).map(unicode),
      });
    if (custom.length)
      sections.push({
        id: "custom",
        title: i18n.t("emoji.category.custom"),
        cells: custom.map(customCell),
      });
    return sections;
  }, [editor, emoji, i18n, query, names]);
}

/** The next cell for an arrow key: rows of nine within a section, then into the next one. */
function step(sections: Section[], at: [number, number], key: string): [number, number] {
  const [s, i] = at;
  const length = sections[s]!.cells.length;
  const column = i % COLUMNS;
  if (key === "ArrowRight")
    return i + 1 < length ? [s, i + 1] : s + 1 < sections.length ? [s + 1, 0] : at;
  if (key === "ArrowLeft")
    return i > 0 ? [s, i - 1] : s > 0 ? [s - 1, sections[s - 1]!.cells.length - 1] : at;
  if (key === "ArrowDown") {
    if (i + COLUMNS < length) return [s, i + COLUMNS];
    const next = sections[s + 1];
    return next ? [s + 1, Math.min(column, next.cells.length - 1)] : [s, length - 1];
  }
  if (i - COLUMNS >= 0) return [s, i - COLUMNS];
  const previous = sections[s - 1];
  if (!previous) return at;
  const last = previous.cells.length - 1;
  return [s - 1, Math.min(Math.floor(last / COLUMNS) * COLUMNS + column, last)];
}

/**
 * The emoji picker (GoTipe Atlas, frame 23), opened from «/» → Emoji: a search field, the
 * categories as glyphs, recent emoji first, a grid with arrow keys, the name in a tooltip.
 */
export function EmojiPicker({
  editor,
  at,
  onClose,
}: {
  editor: GoTipeEditor;
  at: AtomTarget;
  /** `inserted`, `cancel` (Escape: the caret returns) or `away` (the focus went elsewhere). */
  onClose: (result: "inserted" | "cancel" | "away") => void;
}) {
  const i18n = useBlockEditorI18n();
  const [query, setQuery] = useState("");
  const sections = useSections(editor, query);
  const [active, setActive] = useState<[number, number] | null>(null);
  const [tab, setTab] = useState(sections[0]?.id ?? "people");
  const [tip, setTip] = useState<{ label: string; left: number; top: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const anchor = useCallback(
    () =>
      getCaretClientRectFromTrigger(editor, { ...at, query: "" }) ??
      editor.element?.getBoundingClientRect() ??
      null,
    [editor, at],
  );
  const position = useFloatingPosition({ open: true, anchor, element: root, gap: 8 });

  // A hidden panel cannot take the focus: focus the field once it is measured and shown.
  const shown = !!position;
  useLayoutEffect(() => {
    if (shown) field.current?.focus({ preventScroll: true });
  }, [shown]);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose("away");
    };
    document.addEventListener("mousedown", outside, true);
    return () => document.removeEventListener("mousedown", outside, true);
  }, [onClose]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts from the top
  useEffect(() => {
    setActive(null);
    scroller.current?.scrollTo?.({ top: 0 });
  }, [query]);

  const cellElement = (s: number, i: number) =>
    root.current?.querySelector<HTMLElement>(`[data-cell="${s}:${i}"]`) ?? null;
  const showTip = (label: string, element: HTMLElement) => {
    const box = root.current?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (box)
      setTip({ label, left: rect.left - box.left + rect.width / 2, top: rect.top - box.top });
  };
  const choose = (cell: Cell) => {
    const inserted = insertEmoji(editor, cell.choice, at);
    onClose(inserted ? "inserted" : "cancel");
  };
  const move = (key: string) => {
    if (!sections.some((section) => section.cells.length)) return;
    const next = active ? step(sections, active, key) : ([0, 0] as [number, number]);
    setActive(next);
    const element = cellElement(next[0], next[1]);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView?.({ block: "nearest" });
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    // Keys of an input method's composition are its own.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    wrapTab(event, root.current);
    if (event.key === "Escape") {
      event.preventDefault();
      onClose("cancel");
    } else if (
      ["ArrowDown", "ArrowUp"].includes(event.key) ||
      (active && event.key.startsWith("Arrow"))
    ) {
      event.preventDefault();
      if (event.key === "ArrowUp" && active && active[0] === 0 && active[1] < COLUMNS) {
        setActive(null);
        field.current?.focus();
      } else move(event.key);
    } else if (event.key === "Enter" && event.target === field.current) {
      event.preventDefault();
      const first = sections.find((section) => section.cells.length)?.cells[0];
      if (first) choose(first);
    }
  };
  const showSection = (id: Section["id"]) => {
    setTab(id);
    const heading = root.current?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (heading && scroller.current)
      scroller.current.scrollTop = heading.offsetTop - scroller.current.offsetTop;
  };
  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    let current = sections[0]?.id;
    for (const heading of box.querySelectorAll<HTMLElement>("[data-section]"))
      if (heading.offsetTop - box.offsetTop <= box.scrollTop + 1)
        current = heading.dataset.section as Section["id"];
    if (current) setTab(current);
    setTip(null);
  };
  const tabs = query.trim() ? [] : sections;

  return (
    <div
      ref={root}
      className="gotipe-emoji-picker"
      role="dialog"
      aria-label={i18n.t("emoji.picker")}
      data-gotipe-emoji-picker=""
      style={{ position: "fixed", ...position, visibility: position ? "visible" : "hidden" }}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (focusLeaves(event, root.current)) onClose("away");
      }}
    >
      <label className="gotipe-emoji-search">
        <AtomIcon name="search" />
        <input
          ref={field}
          type="search"
          value={query}
          placeholder={i18n.t("emoji.search")}
          aria-label={i18n.t("emoji.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="gotipe-emoji-tabs" role="tablist" aria-label={i18n.t("emoji.picker")}>
        {tabs.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={tab === section.id}
            aria-label={section.title}
            title={section.title}
            className={tab === section.id ? "is-active" : undefined}
            onClick={() => showSection(section.id)}
          >
            <AtomIcon name={TAB_ICONS[section.id as keyof typeof TAB_ICONS]} />
          </button>
        ))}
      </div>
      <div ref={scroller} className="gotipe-emoji-scroll" onScroll={onScroll}>
        {sections.map((section, s) => (
          <div key={section.id} role="group" aria-label={section.title}>
            <div className="gotipe-emoji-label" data-section={section.id} aria-hidden="true">
              {section.title}
            </div>
            {!section.cells.length && (
              <div className="gotipe-emoji-empty">{i18n.t("emoji.empty")}</div>
            )}
            <div className="gotipe-emoji-grid">
              {section.cells.map((cell, i) => (
                <button
                  key={cell.key}
                  type="button"
                  data-cell={`${s}:${i}`}
                  className="gotipe-emoji-cell"
                  tabIndex={
                    active
                      ? active[0] === s && active[1] === i
                        ? 0
                        : -1
                      : s === 0 && i === 0
                        ? 0
                        : -1
                  }
                  aria-label={cell.label}
                  onClick={() => choose(cell)}
                  onMouseEnter={(event) => showTip(cell.label, event.currentTarget)}
                  onMouseLeave={() => setTip(null)}
                  onFocus={(event) => {
                    setActive([s, i]);
                    showTip(cell.label, event.currentTarget);
                  }}
                >
                  {cell.glyph}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {tip && (
        <div className="gotipe-emoji-tip" role="tooltip" style={{ left: tip.left, top: tip.top }}>
          {tip.label}
        </div>
      )}
    </div>
  );
}
