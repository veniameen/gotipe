import type { BlockView, GoTipeEditor, ViewState } from "@gotipe/core";
import { useEditorState, useGoTipeI18n } from "@gotipe/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

/** A heading of the page as its outline shows it. */
export interface OutlineHeading {
  id: string;
  level: number;
  text: string;
}

const DEEPEST_LEVEL = 3;
/** The current section is the last heading above this share of the viewport, from its top. */
const READING_LINE = 0.125;
/** After a click the chosen heading stays current until the scroll is quiet this long. */
const SETTLE_MS = 160;

const textOf = (block: BlockView) =>
  typeof block.content === "string"
    ? block.content
    : (block.content ?? []).map((span) => span.text).join("");

/**
 * The page's top-level headings h1–h3 that have text. A leading h1 that is the very first block is
 * the page's title and stays out of its outline.
 */
export function outlineHeadings(blocks: readonly BlockView[]): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  blocks.forEach((block, index) => {
    if (block.type !== "heading") return;
    const level = Math.min(Math.max(Number(block.attrs.level) || 1, 1), 6);
    const text = textOf(block).trim();
    if (level > DEEPEST_LEVEL || (index === 0 && level === 1) || !text) return;
    headings.push({ id: block.id, level, text });
  });
  return headings;
}

/**
 * The index of the current section from the headings' tops: the last heading above the reading
 * line, the first one while none has reached it, the last one once the scroller is at its end.
 */
export function currentHeadingIndex(tops: readonly number[], line: number, atEnd = false): number {
  if (tops.length === 0) return -1;
  if (atEnd) return tops.length - 1;
  let current = 0;
  tops.forEach((top, index) => {
    if (top <= line) current = index;
  });
  return current;
}

const selectHeadings = (state: ViewState) => outlineHeadings(state.blocks);
const sameHeadings = (a: OutlineHeading[], b: OutlineHeading[]) =>
  a.length === b.length &&
  a.every((heading, i) => {
    const other = b[i];
    return other?.id === heading.id && other.level === heading.level && other.text === heading.text;
  });

function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) return null;
    if (/auto|scroll|overlay/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

function blockElements(root: HTMLElement, ids: Set<string>): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>();
  for (const node of root.querySelectorAll<HTMLElement>("[data-block-id]")) {
    const id = node.dataset.blockId;
    if (id && ids.has(id) && !found.has(id)) found.set(id, node);
  }
  return found;
}

/** The reading line in viewport coordinates and whether the scroller has reached its end. */
function readingPosition(scroller: HTMLElement | null) {
  const box = scroller?.getBoundingClientRect();
  const top = Math.max(box?.top ?? 0, 0);
  const bottom = Math.min(box?.bottom ?? window.innerHeight, window.innerHeight);
  const scrolled = scroller ?? document.scrollingElement ?? document.documentElement;
  const end = scrolled.scrollHeight - scrolled.clientHeight;
  return {
    line: top + (bottom - top) * READING_LINE,
    atEnd: end > 0 && scrolled.scrollTop >= end - 1,
  };
}

const prefersReducedMotion = () =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type Pin = { id: string; timer: ReturnType<typeof setTimeout> } | null;

/** Keeps a chosen heading current while its scroll runs; every scroll event restarts the wait. */
function pin(pinned: { current: Pin }, id: string) {
  clearTimeout(pinned.current?.timer);
  const timer = setTimeout(() => {
    pinned.current = null;
  }, SETTLE_MS);
  pinned.current = { id, timer };
}

/**
 * The outline of the `docs` view (GoTipe Atlas, frame 2): the page's headings beside it, the current
 * section marked. A link scrolls to its heading and puts the caret at its start. Fewer than two
 * headings draw nothing; a narrow container hides it through `--gt-outline-display`.
 */
export function DocsOutline({ editor }: { editor: GoTipeEditor }) {
  const i18n = useGoTipeI18n();
  const headings = useEditorState(editor, selectHeadings, sameHeadings) ?? [];
  const nav = useRef<HTMLElement>(null);
  const pinned = useRef<Pin>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => () => clearTimeout(pinned.current?.timer), []);

  useEffect(() => {
    const element = nav.current;
    if (!element || headings.length < 2) return;
    const scroller = scrollingAncestor(element);
    const ids = new Set(headings.map((heading) => heading.id));
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (pinned.current || !editor.element) return;
      const found = blockElements(editor.element, ids);
      const tops = headings.map(
        (heading) => found.get(heading.id)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
      );
      const { line, atEnd } = readingPosition(scroller);
      setCurrentId(headings[currentHeadingIndex(tops, line, atEnd)]?.id ?? null);
    };
    const schedule = () => {
      if (pinned.current) pin(pinned, pinned.current.id);
      else if (!frame) frame = requestAnimationFrame(measure);
    };
    const passive = { passive: true } as const;
    scroller?.addEventListener("scroll", schedule, passive);
    window.addEventListener("scroll", schedule, passive);
    window.addEventListener("resize", schedule, passive);
    const resized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (element.parentElement) resized?.observe(element.parentElement);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      scroller?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resized?.disconnect();
    };
  }, [editor, headings]);

  if (headings.length < 2) return null;
  const current = headings.some((heading) => heading.id === currentId)
    ? currentId
    : headings[0]!.id;

  const go = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const target = editor.element && blockElements(editor.element, new Set([id])).get(id);
    if (!target) return;
    pin(pinned, id);
    setCurrentId(id);
    if (editor.isEditable) {
      editor.focus();
      editor.setSelection({ anchor: { blockId: id, offset: 0 }, head: { blockId: id, offset: 0 } });
    }
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  };

  return (
    <nav
      ref={nav}
      className="gotipe-outline"
      aria-label={i18n.t("outline.label")}
      data-gotipe-outline=""
    >
      <p className="gotipe-outline-title">{i18n.t("outline.title")}</p>
      {headings.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          data-level={heading.level}
          className={heading.id === current ? "is-current" : undefined}
          aria-current={heading.id === current ? "location" : undefined}
          onClick={(event) => go(event, heading.id)}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  );
}
