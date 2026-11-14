import type { GoTipeEditor } from "@gotipe/core";
import {
  type AtomInfo,
  type AtomTarget,
  insertInlineMath,
  updateInlineMath,
} from "@gotipe/core/extensions";
import { parseTex } from "@gotipe/core/math";
import { mathErrorText, renderMath, useFloatingPosition } from "@gotipe/react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCaretClientRectFromTrigger } from "../components/slash/caret";
import { useBlockEditorI18n } from "../i18n/strings";
import { focusLeaves, wrapTab } from "./dialog-focus";
import { AtomIcon } from "./icons";

const LAYER = "gotipe-atom-edit";

/** Text nodes of a block's document text (widgets left out), with their offsets. */
function* documentText(block: Element): Generator<[Text, number]> {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("[data-gotipe-widget]")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    yield [node as Text, offset];
    offset += node.nodeValue?.length ?? 0;
  }
}

const blockElement = (editor: GoTipeEditor, blockId: string) =>
  editor.element?.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`) ?? null;

/** The element of the atom that starts at `from` of `blockId`. */
export function atomElementAt(
  editor: GoTipeEditor,
  blockId: string,
  from: number,
): HTMLElement | null {
  const block = blockElement(editor, blockId);
  if (!block) return null;
  for (const [node, offset] of documentText(block)) {
    const atom = node.parentElement?.closest<HTMLElement>("[data-gotipe-atom]");
    if (atom && offset === from) return atom;
    if (offset > from) break;
  }
  return null;
}

/** Where an atom element stands: its block and its start offset. */
export function atomPosition(element: Element): { blockId: string; from: number } | null {
  const block = element.closest("[data-block-id]");
  const blockId = block?.getAttribute("data-block-id");
  if (!block || !blockId) return null;
  for (const [node, offset] of documentText(block))
    if (element.contains(node)) return { blockId, from: offset };
  return null;
}

/**
 * The formula popover (GoTipe Atlas, frame 24): TeX in a monospace field, a confirm button and
 * the drawing under it as it is typed. TeX that cannot be read marks the field and names the
 * reason. Enter confirms in one undo step, Escape cancels; the formula stays selected meanwhile.
 */
export function MathPopover({
  editor,
  atom,
  insert,
  created = false,
  onClose,
}: {
  editor: GoTipeEditor;
  atom?: AtomInfo;
  insert?: AtomTarget;
  /** The formula was just made from typed `$…$`: cancelling brings the dollars back. */
  created?: boolean;
  onClose: () => void;
}) {
  const i18n = useBlockEditorI18n();
  const [value, setValue] = useState(atom?.text ?? "");
  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const reasonId = useId();
  const result = useMemo(() => (value.trim() ? parseTex(value) : null), [value]);
  const reason = result && !result.ok ? mathErrorText(i18n, result.error, value) : null;

  // Centred under the formula (or the caret): a virtual anchor as wide as the popover.
  const anchor = useCallback(() => {
    const rect = atom
      ? atomElementAt(editor, atom.blockId, atom.from)?.getBoundingClientRect()
      : insert && getCaretClientRectFromTrigger(editor, { ...insert, query: "" });
    if (!rect) return editor.element?.getBoundingClientRect() ?? null;
    const width = root.current?.offsetWidth ?? 0;
    const left = rect.left + rect.width / 2 - width / 2;
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      left,
      right: left + width,
      width,
    };
  }, [editor, atom, insert]);
  const position = useFloatingPosition({
    open: true,
    anchor,
    element: root,
    gap: 6,
    revision: value,
  });

  // A hidden panel cannot take the focus: focus the field once it is measured and shown.
  const shown = !!position;
  useLayoutEffect(() => {
    if (!shown || document.activeElement === field.current) return;
    const input = field.current;
    input?.focus({ preventScroll: true });
    // The caret after the TeX, as in frame 24.
    input?.setSelectionRange(input.value.length, input.value.length);
  }, [shown]);
  // The formula being edited stays selected (frame 24).
  useEffect(() => {
    if (!atom) return;
    editor.setDecorations(LAYER, [
      {
        type: "inline",
        key: "edit",
        blockId: atom.blockId,
        from: atom.from,
        to: atom.to,
        className: "gotipe-atom-selected",
      },
    ]);
    return () => {
      if (!editor.isDestroyed) editor.setDecorations(LAYER, []);
    };
  }, [editor, atom]);

  const finish = useCallback(
    (caret: number | null) => {
      onClose();
      editor.focus();
      const blockId = atom?.blockId ?? insert?.blockId;
      if (caret !== null && blockId)
        editor.setSelection({
          anchor: { blockId, offset: caret },
          head: { blockId, offset: caret },
        });
    },
    [editor, atom, insert, onClose],
  );
  const confirm = () => {
    const tex = value.replace(/\r\n?|\n/g, " ");
    if (!tex.trim()) return;
    if (atom) {
      if (tex !== atom.text) updateInlineMath(editor, atom, tex);
      finish(atom.from + tex.length);
    } else if (insert && insertInlineMath(editor, tex, insert)) finish(insert.from + tex.length);
  };
  const cancel = () => {
    if (!created) return finish(atom ? atom.to : (insert?.from ?? null));
    // Undo the conversion: the typed `$…$` returns as text, the caret after it.
    onClose();
    editor.focus();
    editor.undo();
  };

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", outside, true);
    return () => document.removeEventListener("mousedown", outside, true);
  }, [onClose]);

  return (
    <div
      ref={root}
      className="gotipe-math-pop"
      role="dialog"
      aria-label={i18n.t(atom ? "math.edit" : "math.label")}
      data-gotipe-math-popover=""
      style={{ position: "fixed", ...position, visibility: position ? "visible" : "hidden" }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        wrapTab(event, root.current);
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      onBlur={(event) => {
        if (focusLeaves(event, root.current)) onClose();
      }}
    >
      <div className="gotipe-math-pop-row">
        <div className={reason ? "gotipe-math-field is-invalid" : "gotipe-math-field"}>
          <input
            ref={field}
            value={value}
            spellCheck={false}
            autoComplete="off"
            aria-label="TeX"
            aria-invalid={reason ? true : undefined}
            aria-describedby={reason ? reasonId : undefined}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                confirm();
              }
            }}
          />
          {reason && (
            <span id={reasonId} className="gotipe-math-reason" role="tooltip">
              {reason}
            </span>
          )}
        </div>
        <button
          type="button"
          className="gotipe-math-confirm"
          aria-label={i18n.t("math.confirm")}
          title={i18n.t("math.confirm")}
          disabled={!value.trim()}
          onClick={confirm}
        >
          <AtomIcon name="check" />
        </button>
      </div>
      <div className="gotipe-math-preview">
        {result?.ok ? (
          <span className="gotipe-math-preview-formula">{renderMath(result.math)}</span>
        ) : (
          <span className="gotipe-math-preview-empty">{value}</span>
        )}
      </div>
    </div>
  );
}
