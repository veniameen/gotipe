import type { GoTipeEditor } from "@gotipe/core";
import { type Suggestion, type SuggestionState, toSafeImageSrc } from "@gotipe/core/extensions";
import { useFloatingPosition } from "@gotipe/react";
import type React from "react";
import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { getCaretClientRectFromTrigger } from "../components/slash/caret";
import { useListOwner } from "../components/slash/combobox";
import { useBlockEditorI18n } from "../i18n/strings";
import { type EmojiChoice, EmojiSuggestion, MentionSuggestion } from "./extensions";
import type { MentionItem } from "./host";
import { AtomIcon } from "./icons";

const fold = (text: string) => text.toLowerCase().replaceAll("ё", "е");

/** `label` with the first match of `query` in bold (frames 22–23). */
export function highlight(label: string, query: string): React.ReactNode {
  const at = query ? fold(label).indexOf(fold(query)) : -1;
  if (at < 0) return label;
  return (
    <>
      {label.slice(0, at)}
      <mark>{label.slice(at, at + query.length)}</mark>
      {label.slice(at + query.length)}
    </>
  );
}

/** The open suggestion of `editor`, following its events. */
function useSuggestion<Item>(editor: GoTipeEditor, suggestion: Suggestion<Item>) {
  const [state, setState] = useState<SuggestionState<Item> | null>(() => suggestion.state(editor));
  useEffect(() => {
    setState(suggestion.state(editor));
    return suggestion.on((event) => {
      if (event.editor !== editor) return;
      setState(event.type === "close" ? null : event.type === "select" ? null : event.state);
    });
  }, [editor, suggestion]);
  return state;
}

interface ListProps<Item> {
  editor: GoTipeEditor;
  suggestion: Suggestion<Item>;
  label: string;
  empty: string;
  className?: string;
  row: (item: Item, query: string) => React.ReactNode;
  /** A label before the row when it starts a new group. */
  group?: (item: Item, previous: Item | undefined) => string | null;
}

/**
 * A list at the caret driven by a suggestion: ↑/↓/↵/Esc come from the suggestion's keys, the
 * pointer chooses a row; it measures before showing and follows the caret on scroll.
 */
function SuggestionList<Item>({
  editor,
  suggestion,
  label,
  empty,
  className,
  row,
  group,
}: ListProps<Item>) {
  const state = useSuggestion(editor, suggestion);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const i18n = useBlockEditorI18n();
  const anchor = useCallback(() => {
    const current = suggestion.state(editor);
    if (!current) return null;
    return (
      getCaretClientRectFromTrigger(editor, {
        ...current.range,
        to: current.range.from,
        query: current.query,
      }) ?? current.rect
    );
  }, [editor, suggestion]);
  const position = useFloatingPosition({
    open: !!state,
    anchor,
    element: ref,
    gap: 8,
    revision: state,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the highlighted row changes
  useEffect(() => {
    ref.current?.querySelector(".is-selected")?.scrollIntoView?.({ block: "nearest" });
  }, [state?.selectedIndex]);
  const shown = !!state && editor.isEditable && !(state.loading && !state.items.length);
  useListOwner(
    editor,
    shown ? listId : null,
    shown && state.items.length ? `${listId}-${state.selectedIndex}` : null,
  );
  if (!state || !editor.isEditable) return null;
  const { items, query, selectedIndex, loading } = state;
  if (loading && !items.length) return null;
  return (
    <div
      ref={ref}
      className={["gotipe-suggest", className].filter(Boolean).join(" ")}
      data-gotipe-suggestion=""
      style={{
        position: "fixed",
        ...position,
        visibility: position ? "visible" : "hidden",
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div id={listId} className="gotipe-suggest-list" role="listbox" aria-label={label}>
        {items.map((item, index) => {
          const title = group?.(item, items[index - 1]);
          return (
            <Fragment key={index}>
              {title && (
                <div className="gotipe-suggest-label" role="presentation">
                  {title}
                </div>
              )}
              <div
                id={`${listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === selectedIndex}
                className={
                  index === selectedIndex
                    ? "gotipe-suggest-item is-selected"
                    : "gotipe-suggest-item"
                }
                onClick={() => suggestion.select(editor, index)}
              >
                {row(item, query)}
                {index === selectedIndex && (
                  <span className="gotipe-suggest-key" aria-hidden="true">
                    ↵
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
        {!items.length && (
          <div className="gotipe-suggest-empty" role="status">
            {empty}
          </div>
        )}
      </div>
      <div aria-live="polite" className="gotipe-sr-only">
        {items.length ? i18n.t("slashMenu.results", { count: items.length }) : empty}
      </div>
    </div>
  );
}

function initials(label: string): string {
  return label
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}
function person(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return (hash % 3) + 1;
}

/** The «@» list (frame 22): people with initials, then pages; the match in bold. */
export function MentionMenu({ editor }: { editor: GoTipeEditor }) {
  const i18n = useBlockEditorI18n();
  return (
    <SuggestionList<MentionItem>
      editor={editor}
      suggestion={MentionSuggestion}
      label={i18n.t("mention.list")}
      empty={i18n.t("mention.empty")}
      className="has-avatars"
      group={(item, previous) => {
        const kind = item.kind === "page" ? "page" : "user";
        const before = previous && (previous.kind === "page" ? "page" : "user");
        if (kind === before) return null;
        return i18n.t(kind === "page" ? "mention.pages" : "mention.people");
      }}
      row={(item, query) => (
        <>
          {item.kind === "page" ? (
            <AtomIcon name="page" />
          ) : (
            <span className="gotipe-avatar" data-person={person(item.id)} aria-hidden="true">
              {initials(item.label)}
            </span>
          )}
          <span className="gotipe-suggest-text">{highlight(item.label, query)}</span>
        </>
      )}
    />
  );
}

/** The «:» list (frame 23): the emoji, then its name with the match in bold. */
export function EmojiMenu({ editor }: { editor: GoTipeEditor }) {
  const i18n = useBlockEditorI18n();
  return (
    <SuggestionList<EmojiChoice>
      editor={editor}
      suggestion={EmojiSuggestion}
      label={i18n.t("emoji.picker")}
      empty={i18n.t("emoji.empty")}
      row={(choice, query) => (
        <>
          <span className="gotipe-suggest-emoji" aria-hidden="true">
            {choice.kind === "custom" ? (
              <img src={toSafeImageSrc(choice.item.src) ?? undefined} alt="" draggable={false} />
            ) : (
              choice.item.emoji
            )}
          </span>
          <span className="gotipe-suggest-text">{highlight(choice.label, query)}</span>
        </>
      )}
    />
  );
}
