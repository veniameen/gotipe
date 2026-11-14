import type { GoTipeEditor } from "@gotipe/core";
import { getInlineMath } from "@gotipe/core/extensions";
import { parseTex } from "@gotipe/core/math";
import { MathRendererContext } from "@gotipe/react";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useBlockEditorI18n } from "../i18n/strings";
import { loadEmojiNames } from "./emoji-names";
import { EmojiPicker } from "./emoji-picker";
import {
  type AtomRequest,
  type EmojiOptions,
  type MentionOptions,
  caretTarget,
  onAtomRequest,
  setAtomHost,
} from "./host";
import { MathPopover, atomPosition } from "./math-popover";
import { EmojiMenu, MentionMenu } from "./suggestion-menus";

export interface AtomUIProps {
  editor: GoTipeEditor;
  /** People and pages of the «@» list; without it the list answers «No one found». */
  mentions?: MentionOptions;
  /** The team's emoji and the recent list of the «:» list and the picker. */
  emoji?: EmojiOptions;
}

const FORMULA = '[data-gotipe-atom][data-type="inlineMath"]';
const HostContext = createContext<Omit<AtomUIProps, "editor">>({});

/**
 * Gives the editor below it formulas drawn with GoTipe's TeX → MathML converter and the
 * host's `mentions` and `emoji` for `AtomUI` (`BlockEditor` wraps itself in it).
 */
export function AtomProvider({
  mentions,
  emoji,
  children,
}: Omit<AtomUIProps, "editor"> & { children: React.ReactNode }) {
  const host = useMemo(() => ({ mentions, emoji }), [mentions, emoji]);
  return (
    <MathRendererContext.Provider value={parseTex}>
      <HostContext.Provider value={host}>{children}</HostContext.Provider>
    </MathRendererContext.Provider>
  );
}

/**
 * The interface of inline atoms (GoTipe Atlas, frames 22–24): the «@» and «:» lists at the
 * caret, the emoji picker of «/» → Emoji and the formula popover, which opens on a click on a
 * formula, on Enter with a formula selected, after `$…$` and from «/» → Inline formula. Needs
 * the editor to include `atomExtensions()`.
 */
export function AtomUI(props: AtomUIProps) {
  const { editor } = props;
  const provided = useContext(HostContext);
  const mentions = props.mentions ?? provided.mentions;
  const emoji = props.emoji ?? provided.emoji;
  const i18n = useBlockEditorI18n();
  const [request, setRequest] = useState<AtomRequest | null>(null);
  const [, namesLoaded] = useState(0);
  useEffect(() => {
    setAtomHost(editor, { mentions, emoji, locale: i18n.locale });
    // Emoji names of the interface language load only when it needs them.
    let live = true;
    loadEmojiNames(i18n.locale).then((names) => {
      if (live && names) namesLoaded((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [editor, mentions, emoji, i18n.locale]);
  useEffect(() => onAtomRequest(editor, setRequest), [editor]);
  useEffect(() => {
    const own = (target: EventTarget | null): Element | null =>
      target instanceof Element && editor.element?.contains(target) ? target : null;
    const click = (event: MouseEvent) => {
      const formula = own(event.target)?.closest(FORMULA);
      const at = formula && editor.isEditable ? atomPosition(formula) : null;
      const atom = at && getInlineMath(editor, { blockId: at.blockId, offset: at.from + 1 });
      if (!atom) return;
      event.preventDefault();
      setRequest({ type: "math", atom });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey)
        return;
      const range = own(event.target) && editor.isEditable ? caretTarget(editor) : null;
      if (!range || range.from === range.to) return;
      const atom = getInlineMath(editor, { blockId: range.blockId, offset: range.from + 1 });
      if (!atom || atom.from !== range.from || atom.to !== range.to) return;
      event.preventDefault();
      event.stopPropagation();
      setRequest({ type: "math", atom });
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", key, true);
    };
  }, [editor]);
  const close = useCallback(() => setRequest(null), []);
  const closePicker = useCallback(
    (result: "inserted" | "cancel" | "away") => {
      const at = request?.type === "emojiPicker" ? request.at : null;
      setRequest(null);
      // The focus went elsewhere on purpose: leave it there.
      if (result === "away") return;
      editor.focus();
      if (result === "cancel" && at)
        editor.setSelection({
          anchor: { blockId: at.blockId, offset: at.from },
          head: { blockId: at.blockId, offset: at.to },
        });
    },
    [editor, request],
  );
  return (
    <>
      <MentionMenu editor={editor} />
      <EmojiMenu editor={editor} />
      {request?.type === "emojiPicker" && (
        <EmojiPicker editor={editor} at={request.at} onClose={closePicker} />
      )}
      {request?.type === "math" && (
        <MathPopover
          key={"atom" in request ? `${request.atom.blockId}:${request.atom.from}` : "insert"}
          editor={editor}
          atom={"atom" in request ? request.atom : undefined}
          insert={"insert" in request ? request.insert : undefined}
          created={"created" in request && request.created === true}
          onClose={close}
        />
      )}
    </>
  );
}
