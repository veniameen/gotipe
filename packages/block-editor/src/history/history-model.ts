import type { Block, Document } from "@gotipe/core";
import {
  type TextChange,
  type WordChanges,
  blockText,
  compareDocuments,
  countWordChanges,
  diffText,
} from "@gotipe/versions";

/** A saved version as the panel shows it; `Version` of `@gotipe/versions` fits as it is. */
export interface HistoryVersion {
  id: string;
  name: string;
  /** ISO time of saving. */
  createdAt: string;
  /** The author's display name; `"system"` with no `auto` marks an automatic save without one. */
  createdBy: string;
  snapshot: Document;
  /** Saved automatically: listed as «Автосохранение» with its author, if any. */
  auto?: boolean;
  /** The author's colour, 1–3; by default it follows the name. */
  person?: 1 | 2 | 3;
}

/** One row of the list: a saved version, or the page as it is now (`version: null`). */
export interface HistoryRow {
  id: string;
  version: HistoryVersion | null;
  /** The row of the page as it is: choosing it shows the live page. */
  live: boolean;
  time: Date;
  author: string | null;
  person: 1 | 2 | 3;
  words: WordChanges;
}

export interface HistoryDay {
  key: string;
  date: Date;
  rows: HistoryRow[];
}

/** The id of the row of the live page while it differs from every saved version. */
export const LIVE_ROW = "gotipe-history-live";
export const EMPTY: Document = { version: 1, blocks: [] };

const same = (a: Document, b: Document) => {
  const diff = compareDocuments(a, b);
  return !diff.added.length && !diff.removed.length && !diff.modified.length && !diff.moved.length;
};

export function personOf(name: string, own?: 1 | 2 | 3): 1 | 2 | 3 {
  if (own) return own;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return ((hash % 3) + 1) as 1 | 2 | 3;
}

/** «Мария Лебедева» → «МЛ»: the first letters of the first two words. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}

const authorOf = (version: HistoryVersion) =>
  version.createdBy === "system" && !version.auto ? null : version.createdBy || null;

/** Saved versions, newest first, each with the words it added since the one before it. */
export function savedRows(versions: readonly HistoryVersion[]): HistoryRow[] {
  // newest first; of two saved at the same moment the one given later is the newer
  const ordered = versions
    .map((version, index) => ({ version, index, time: Date.parse(version.createdAt) || 0 }))
    .sort((a, b) => b.time - a.time || b.index - a.index)
    .map(({ version }) => version);
  return ordered.map((version, index) => {
    const author = authorOf(version);
    return {
      id: version.id,
      version,
      live: false,
      time: new Date(version.createdAt),
      author,
      person: personOf(author ?? "", version.person),
      words: countWordChanges(ordered[index + 1]?.snapshot ?? EMPTY, version.snapshot),
    };
  });
}

/**
 * The list over the live page: when it differs from the newest saved version, a row of its own
 * leads the list; otherwise the newest version is the live page.
 */
export function withLiveRow(
  saved: HistoryRow[],
  live: Document,
  liveAt: Date,
  user: { name: string; person?: 1 | 2 | 3 } | undefined,
): HistoryRow[] {
  const newest = saved[0];
  if (newest?.version && same(newest.version.snapshot, live))
    return [{ ...newest, live: true }, ...saved.slice(1)];
  if (!newest) return [];
  const author = user?.name ?? null;
  return [
    {
      id: LIVE_ROW,
      version: null,
      live: true,
      time: liveAt,
      author,
      person: personOf(author ?? "", user?.person),
      words: countWordChanges(newest.version?.snapshot ?? EMPTY, live),
    },
    ...saved,
  ];
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** Rows by the local day they were saved on, in the list's order. */
export function groupByDay(rows: HistoryRow[]): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const row of rows) {
    const key = dayKey(row.time);
    const last = days[days.length - 1];
    if (last?.key === key) last.rows.push(row);
    else days.push({ key, date: row.time, rows: [row] });
  }
  return days;
}

/** «Сегодня», «Вчера» or the date, as the list heads a day. */
export function dayLabel(
  date: Date,
  now: Date,
  locale: string,
  words: { today: string; yesterday: string },
): string {
  if (dayKey(date) === dayKey(now)) return words.today;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return words.yesterday;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

export const timeLabel = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);

/** One block of the comparison: as it is now, or as it was when it was removed. */
export interface DiffNode {
  block: Block;
  status: "same" | "added" | "removed" | "changed";
  /** The text of a changed block, word by word; absent when only its form changed. */
  text?: TextChange[];
  children: DiffNode[];
}

export interface CompareResult {
  nodes: DiffNode[];
  added: number;
  removed: number;
  changed: number;
}

/** A block that stands on the page by itself: text of its own, or nothing inside (a divider). */
export const standsAlone = (block: Block) => block.content !== null || block.children.length === 0;

/**
 * The page of `after` with what `before` had and `after` lost put back where it stood: added,
 * removed and changed blocks are marked, a changed text is compared word by word.
 */
export function compareTree(before: Document, after: Document): CompareResult {
  const diff = compareDocuments(before, after);
  const added = new Set(diff.added);
  const removed = new Set(diff.removed);
  const modified = new Set(diff.modified);
  const old = new Map<string, Block>();
  const index = (blocks: Block[]) => {
    for (const block of blocks) {
      old.set(block.id, block);
      index(block.children);
    }
  };
  index(before.blocks);
  const counts = { added: 0, removed: 0, changed: 0 };

  const gone = (block: Block): DiffNode => {
    if (standsAlone(block)) counts.removed++;
    return {
      block,
      status: "removed",
      children: block.children.filter((child) => removed.has(child.id)).map(gone),
    };
  };
  const present = (block: Block): DiffNode => {
    const previous = old.get(block.id);
    let status: DiffNode["status"] = "same";
    let text: TextChange[] | undefined;
    if (added.has(block.id)) status = "added";
    else if (modified.has(block.id) && previous) {
      status = "changed";
      const was = blockText(previous);
      const now = blockText(block);
      if (was !== now) text = diffText(was, now);
    }
    if (status !== "same" && standsAlone(block)) counts[status === "added" ? "added" : "changed"]++;
    return {
      block,
      status,
      text,
      children: merge(block.children, previous?.children ?? []),
    };
  };
  const merge = (current: Block[], previous: Block[]): DiffNode[] => {
    const nodes = current.map(present);
    previous.forEach((block, position) => {
      if (!removed.has(block.id)) return;
      let at = 0;
      for (let earlier = position - 1; earlier >= 0; earlier--) {
        const found = nodes.findIndex((node) => node.block.id === previous[earlier]!.id);
        if (found >= 0) {
          at = found + 1;
          break;
        }
      }
      while (nodes[at]?.status === "removed") at++;
      nodes.splice(at, 0, gone(block));
    });
    return nodes;
  };
  return { nodes: merge(after.blocks, before.blocks), ...counts };
}
