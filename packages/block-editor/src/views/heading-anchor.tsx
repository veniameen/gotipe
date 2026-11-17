import type { GoTipeEditor, ViewState } from "@gotipe/core";
import { type AfterTextFn, useEditorState } from "@gotipe/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { outlineHeadings } from "../components/docs-outline";
import { Tip } from "../components/formatting/tip";
import { useBlockEditorI18n } from "../i18n/strings";
import { copyBlockLink } from "../interaction/block-link";
import { PageIcon } from "../page/icons";

/** How long the anchor's tip says the link is copied. */
const COPIED_MS = 1600;

/** The block the handle stands at: under the pointer, or the one a finger touched last. */
interface HoveredBlock {
  get(): string | null;
  set(id: string | null): void;
  subscribe(listener: () => void): () => void;
}

function createHoveredBlock(): HoveredBlock {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(id) {
      if (id === current) return;
      current = id;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const selectAnchored = (state: ViewState) => outlineHeadings(state.blocks).map(({ id }) => id);
const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * The anchors of the docs view (GoTipe Atlas, frame 2): a quiet # after the last word of every
 * heading its outline lists. It shows under the pointer — the heading's own hover, or the block
 * the handle stands at (`hovered`), which is also the heading a finger touched. A click copies the
 * link to the heading, as “Copy link to block” does. Other views draw none.
 */
export function useHeadingAnchors(
  editor: GoTipeEditor | null,
  view: string,
  hovered: string | null,
): AfterTextFn | undefined {
  const [hoveredBlock] = useState(createHoveredBlock);
  useEffect(() => hoveredBlock.set(hovered), [hoveredBlock, hovered]);
  const docs = view === "docs";
  const ids = useEditorState(docs ? editor : null, selectAnchored, sameIds);
  return useMemo(() => {
    if (!docs || !editor || !ids?.length) return undefined;
    const anchored = new Set(ids);
    return (block) =>
      anchored.has(block.id) ? (
        <HeadingAnchor editor={editor} blockId={block.id} hovered={hoveredBlock} />
      ) : null;
  }, [docs, editor, ids, hoveredBlock]);
}

/**
 * The anchor itself. It has no width: it stays with the heading's last word and its button hangs
 * in the room the heading keeps at the end of its lines (`--gt-anchor-room`), so showing it moves
 * nothing. It never takes Tab and stays out of the heading's name; the keyboard copies the link
 * from the block menu.
 */
function HeadingAnchor({
  editor,
  blockId,
  hovered,
}: {
  editor: GoTipeEditor;
  blockId: string;
  hovered: HoveredBlock;
}) {
  const i18n = useBlockEditorI18n();
  const shown = useSyncExternalStore(
    hovered.subscribe,
    () => hovered.get() === blockId,
    () => false,
  );
  const [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const label = i18n.t(copied ? "block.headingLinkCopied" : "block.copyHeadingLink");
  const copy = async () => {
    const done = await copyBlockLink(editor, blockId, i18n.t("media.clipboardUnavailable"));
    if (done && mounted.current) setCopied(true);
  };
  return (
    <span
      className={shown ? "gotipe-heading-anchor is-hovered" : "gotipe-heading-anchor"}
      aria-hidden="true"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        // the caret and the selection stay where they are
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void copy()}
      >
        <PageIcon name="hash" />
        <Tip label={label} />
      </button>
    </span>
  );
}
