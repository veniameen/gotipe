import type { GoTipeEditor } from "@gotipe/core";
import {
  type FindReplaceController,
  type FindReplaceState,
  getFindReplace,
} from "@gotipe/core/extensions";
import type { TranslationKey } from "@gotipe/i18n";
import type React from "react";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { blockPath } from "../components/formatting/selection";
import { Tip } from "../components/formatting/tip";
import { useBlockEditorI18n } from "../i18n/strings";
import { isHostKey } from "../page/host-slot";
import { PageIcon, type PageIconName } from "../page/icons";
import { FIND_KEYS, findShortcut } from "./find-keys";

const ERRORS: Record<string, TranslationKey> = {
  INVALID_PATTERN: "find.invalidPattern",
  UNSAFE_PATTERN: "find.unsafePattern",
  TIMEOUT: "find.timeout",
};

function useFindState(controller: FindReplaceController): FindReplaceState {
  return useSyncExternalStore(
    useCallback((notify) => controller.subscribe(notify), [controller]),
    () => controller.getState(),
    () => controller.getState(),
  );
}

/** Text of a selection inside one block: what the field starts with when the bar opens. */
function selectedText(editor: GoTipeEditor): string {
  const { selection } = editor.getViewState();
  if (selection.type !== "text" || selection.anchor.blockId !== selection.head.blockId) return "";
  const from = Math.min(selection.anchor.offset, selection.head.offset);
  const to = Math.max(selection.anchor.offset, selection.head.offset);
  if (from === to) return "";
  const block = blockPath(editor.getViewState().blocks, selection.anchor.blockId).at(-1);
  const text = Array.isArray(block?.content) ? block.content.map((span) => span.text).join("") : "";
  const picked = text.slice(from, to);
  return picked.includes("\n") ? "" : picked;
}

export interface FindBarProps {
  editor: GoTipeEditor;
  /** The element whose keys open the bar: the editor's root. Keys elsewhere stay the browser's. */
  root: RefObject<HTMLElement | null>;
}

/**
 * Find and replace over the document (Atlas frame 25), docked at the top right of the editor.
 * `Mod+F` opens it while the editor has focus — elsewhere the browser's own search stays —
 * `Mod+Alt+F` opens it with replace. Enter and Shift+Enter step through the matches, Escape
 * closes it, selects the current match and gives the keys back to the text. Needs `FindReplace`.
 */
export function FindBar({ editor, root }: FindBarProps) {
  const controller = getFindReplace(editor);
  return controller ? <FindDock editor={editor} root={root} controller={controller} /> : null;
}

function FindDock({
  editor,
  root,
  controller,
}: FindBarProps & { controller: FindReplaceController }) {
  const i18n = useBlockEditorI18n();
  const state = useFindState(controller);
  const [open, setOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  /** Bumped by every Mod+F: the field takes the keys as the bar commits, before the next key. */
  const [focusRequest, setFocusRequest] = useState(0);
  const [replacement, setReplacement] = useState("");
  const [editable, setEditable] = useState(editor.isEditable);
  const field = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  /** The query of the last search: the bar opens with it again. */
  const last = useRef("");

  const show = useCallback(
    (withReplace: boolean) => {
      // An open bar keeps its current match; a new one starts from the selection or the last query.
      if (!shown.current) {
        const query = selectedText(editor) || last.current;
        if (query) controller.setSearch({ query });
      }
      shown.current = true;
      setOpen(true);
      if (withReplace && editor.isEditable) setReplacing(true);
      setFocusRequest((value) => value + 1);
    },
    [editor, controller],
  );
  const hide = useCallback(() => {
    const found = controller.getState().index >= 0;
    if (found) controller.selectCurrent();
    last.current = controller.getState().query;
    controller.clear();
    shown.current = false;
    setOpen(false);
    if (!editor.isDestroyed) editor.focus();
  }, [editor, controller]);

  // The keys belong to the bar only while the focus is in the editor or the bar.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const keydown = (event: KeyboardEvent) => {
      const wanted = isHostKey(event) ? null : findShortcut(event);
      if (!wanted) return;
      event.preventDefault();
      event.stopPropagation();
      show(wanted === "replace");
    };
    element.addEventListener("keydown", keydown, true);
    return () => element.removeEventListener("keydown", keydown, true);
  }, [root, show]);

  useEffect(() => {
    setEditable(editor.isEditable);
    return editor.on("editableChange", (value) => {
      setEditable(value);
      if (!value) setReplacing(false);
    });
  }, [editor]);

  // The search stops with the bar: no highlights stay behind an unmounted bar.
  useEffect(() => () => controller.clear(), [controller]);

  useLayoutEffect(() => {
    if (!open || !focusRequest) return;
    field.current?.focus();
    field.current?.select();
  }, [open, focusRequest]);

  // The current match comes into view as it changes.
  const current = state.matches[state.index];
  useEffect(() => {
    if (!open || !current) return;
    const frame = requestAnimationFrame(() => {
      const mark = editor.element?.querySelector<HTMLElement>("[data-gotipe-search-current]");
      mark?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, open, current]);

  if (!open) return null;

  const empty = state.query !== "" && !state.pending && state.total === 0;
  const error = state.error ? i18n.t(ERRORS[state.error.code] ?? "find.invalidPattern") : null;
  const count = i18n.t(state.truncated ? "find.countMore" : "find.count", {
    position: state.position,
    total: state.total,
  });
  const keys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      hide();
    }
  };
  const tool = (
    icon: PageIconName,
    label: TranslationKey,
    action: () => void,
    options: { pressed?: boolean; disabled?: boolean; binding?: string } = {},
  ) => (
    <button
      type="button"
      className="gotipe-format-tool"
      aria-label={i18n.t(label)}
      aria-pressed={options.pressed}
      disabled={options.disabled}
      onClick={action}
    >
      <PageIcon name={icon} />
      <Tip label={i18n.t(label)} binding={options.binding} />
    </button>
  );
  const replaceOne = () => void controller.replace(replacement);
  const replaceAll = () => void controller.replaceAll(replacement);

  return (
    <div className="gotipe-find-dock">
      <div
        ref={bar}
        className="gotipe-find"
        role="search"
        aria-label={i18n.t(replacing ? "find.replaceLabel" : "find.label")}
        data-gotipe-find=""
        onKeyDown={keys}
      >
        <button
          type="button"
          className="gotipe-format-tool"
          aria-label={i18n.t("find.toggleReplace")}
          aria-expanded={replacing}
          disabled={!editable}
          onClick={() => setReplacing((value) => !value)}
        >
          <PageIcon name={replacing ? "chevron" : "chevronRight"} />
          <Tip label={i18n.t("find.toggleReplace")} binding={FIND_KEYS.replace} />
        </button>
        <span className={`gotipe-find-field${empty || error ? " is-invalid" : ""}`}>
          <input
            ref={field}
            type="text"
            aria-label={i18n.t("find.query")}
            placeholder={i18n.t("find.query")}
            aria-invalid={empty || error ? true : undefined}
            title={error ?? undefined}
            spellCheck={false}
            value={state.query}
            onChange={(event) => controller.setSearch({ query: event.currentTarget.value })}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (event.shiftKey) controller.previous();
              else controller.next();
            }}
          />
          {state.query !== "" && (
            <span className="gotipe-find-count" aria-live="polite">
              {count}
            </span>
          )}
        </span>
        <span className="gotipe-find-tools">
          {tool(
            "case",
            "find.caseSensitive",
            () => controller.setSearch({ caseSensitive: !state.caseSensitive }),
            { pressed: state.caseSensitive },
          )}
          {tool(
            "word",
            "find.wholeWord",
            () => controller.setSearch({ wholeWord: !state.wholeWord }),
            { pressed: state.wholeWord },
          )}
          {tool("regex", "find.regex", () => controller.setSearch({ regex: !state.regex }), {
            pressed: state.regex,
          })}
          <span className="gotipe-find-sep" aria-hidden="true" />
          {tool("up", "find.previous", () => controller.previous(), {
            disabled: state.total === 0,
          })}
          {tool("down", "find.next", () => controller.next(), {
            disabled: state.total === 0,
          })}
          {tool("close", "find.close", hide)}
        </span>
        {replacing && editable && (
          <>
            <span className="gotipe-find-field gotipe-find-replace">
              <input
                type="text"
                aria-label={i18n.t("find.replacement")}
                placeholder={i18n.t("find.replacement")}
                spellCheck={false}
                value={replacement}
                onChange={(event) => setReplacement(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  if (event.metaKey || event.ctrlKey) replaceAll();
                  else replaceOne();
                }}
              />
            </span>
            <span className="gotipe-find-tools">
              <button
                type="button"
                className="gotipe-find-button"
                disabled={state.total === 0}
                onClick={replaceOne}
              >
                {i18n.t("find.replace")}
              </button>
              <button
                type="button"
                className="gotipe-find-button"
                disabled={state.total === 0}
                onClick={replaceAll}
              >
                {i18n.t("find.replaceAll")}
              </button>
            </span>
          </>
        )}
        {error && (
          <span className="gotipe-sr-only" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
