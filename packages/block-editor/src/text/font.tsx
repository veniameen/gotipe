import type { GoTipeEditor, Selection } from "@gotipe/core";
import {
  FONT_FAMILIES,
  type FontFamilyName,
  getFontFamily,
  getFontSize,
  setFontFamily,
  setFontSize,
  unsetFontFamily,
} from "@gotipe/core/extensions";
import type { TranslationKey } from "@gotipe/i18n";
import { useEditorState } from "@gotipe/react";
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { capturedSelection } from "../components/formatting/selection";
import { Tip } from "../components/formatting/tip";
import { useFormattingMenu } from "../components/formatting/use-formatting-menu";
import { useBlockEditorI18n } from "../i18n/strings";
import { PageIcon } from "../page/icons";

const FAMILY_NAMES: Record<FontFamilyName, TranslationKey> = {
  system: "font.system",
  serif: "font.serif",
  mono: "font.mono",
};

/**
 * The font of a selection in a fixed toolbar (Atlas frame 27, modern view): the current face by
 * name, and a list where each face is named in itself. The system face is the document's own, so
 * choosing it removes the mark. Needs the `FontFamily` extension.
 */
export function FontFamilyPicker({ editor }: { editor: GoTipeEditor }) {
  const i18n = useBlockEditorI18n();
  const menu = useFormattingMenu(editor);
  const current = useEditorState(editor, () => getFontFamily(editor) ?? "system") ?? "system";
  const pick = (family: FontFamilyName) =>
    menu.apply(() =>
      family === "system" ? unsetFontFamily(editor) : setFontFamily(editor, family),
    );
  return (
    <div className="gotipe-format-anchor">
      <button
        ref={menu.trigger}
        type="button"
        className="gotipe-format-tool is-text"
        aria-label={`${i18n.t("font.family")}: ${i18n.t(FAMILY_NAMES[current])}`}
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        disabled={!menu.editable}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (menu.open ? menu.close() : menu.show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !menu.open) {
            event.preventDefault();
            menu.show();
          }
        }}
      >
        <span className="gotipe-format-tool-label">{i18n.t(FAMILY_NAMES[current])}</span>
        <PageIcon name="chevron" />
        <Tip label={i18n.t("font.family")} />
      </button>
      {menu.open && (
        <div
          ref={menu.popup}
          className="gotipe-format-menu"
          role="listbox"
          aria-label={i18n.t("font.family")}
          data-gotipe-formatting-popup=""
          style={menu.style}
          onKeyDown={menu.keydown}
        >
          {FONT_FAMILIES.map((family) => (
            <button
              key={family}
              type="button"
              role="option"
              aria-selected={family === current}
              className={family === current ? "is-current" : undefined}
              data-font-family={family}
              onClick={() => pick(family)}
            >
              <span className="gotipe-menu-text gotipe-font" data-font={family}>
                {i18n.t(FAMILY_NAMES[family])}
              </span>
              {family === current && <PageIcon name="check" className="gotipe-menu-end" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The size the theme draws the text of block `id` with, or `null` when it is not drawn. */
function themeSize(editor: GoTipeEditor, id: string): number | null {
  const root = editor.element;
  const block = id && root ? root.querySelector(`[data-block-id="${CSS.escape(id)}"]`) : null;
  const size = block ? Number.parseFloat(getComputedStyle(block).fontSize) : Number.NaN;
  return Number.isFinite(size) ? Math.round(size) : null;
}

/**
 * The size of the text at the caret: its own mark, else what the theme gives its block. The
 * computed style is read only when the caret's block, its type or level changes.
 */
function useShownSize(editor: GoTipeEditor): number | null {
  const marked = useEditorState(editor, () => getFontSize(editor)) ?? null;
  const where =
    useEditorState(editor, (state) => {
      const block = editor.getCurrentBlock();
      return `${state.selection.anchor.blockId}|${block?.type ?? ""}|${String(block?.attrs.level ?? "")}`;
    }) ?? "";
  const [base, setBase] = useState<number | null>(null);
  useLayoutEffect(() => {
    setBase(themeSize(editor, where.split("|")[0] ?? ""));
  }, [editor, where]);
  return marked ?? base;
}

export interface FontSizeStepperProps {
  editor: GoTipeEditor;
  /** The smallest size the buttons reach. Default 10, as `FontSize` allows. */
  min?: number;
  /** The largest size. Default 48. */
  max?: number;
}

/**
 * The size of a selection in a fixed toolbar (Atlas frame 27): minus, the size, plus; one step a
 * press. The size can be typed: Enter or leaving the field applies it, arrows step it, Escape
 * returns to the text. Needs the `FontSize` extension.
 */
export function FontSizeStepper({ editor, min = 10, max = 48 }: FontSizeStepperProps) {
  const i18n = useBlockEditorI18n();
  const size = useShownSize(editor);
  const [draft, setDraft] = useState<string | null>(null);
  const [editable, setEditable] = useState(editor.isEditable);
  const selection = useRef<Selection | null>(null);
  useEffect(() => {
    setEditable(editor.isEditable);
    return editor.on("editableChange", setEditable);
  }, [editor]);
  const apply = (value: number, refocus: boolean) => {
    if (!Number.isFinite(value) || !editor.isEditable) return;
    if (selection.current) editor.chain().setSelection(selection.current).run();
    setFontSize(editor, Math.min(max, Math.max(min, Math.round(value))));
    if (refocus) editor.focus();
  };
  const step = (delta: number) => {
    if (size !== null) setFontSize(editor, Math.min(max, Math.max(min, size + delta)));
  };
  const keep = (event: React.MouseEvent) => event.preventDefault();
  return (
    <span className="gotipe-size-stepper" role="group" aria-label={i18n.t("font.size")}>
      <button
        type="button"
        className="gotipe-format-tool"
        aria-label={i18n.t("font.smaller")}
        disabled={!editable || size === null || size <= min}
        onMouseDown={keep}
        onClick={() => step(-1)}
      >
        <PageIcon name="minus" />
        <Tip label={i18n.t("font.smaller")} />
      </button>
      <input
        className="gotipe-size-field"
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-label={i18n.t("font.size")}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={size ?? undefined}
        disabled={!editable}
        value={draft ?? (size === null ? "" : String(size))}
        onFocus={(event) => {
          selection.current = capturedSelection(editor.getViewState().selection);
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.currentTarget.value.replace(/[^\d]/g, ""))}
        onBlur={() => {
          if (draft) apply(Number(draft), false);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (draft) apply(Number(draft), true);
            else editor.focus();
            setDraft(null);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(null);
            if (selection.current) editor.chain().setSelection(selection.current).focus().run();
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const base = draft ? Number(draft) : (size ?? min);
            apply(base + (event.key === "ArrowUp" ? 1 : -1), false);
            setDraft(null);
          }
        }}
      />
      <button
        type="button"
        className="gotipe-format-tool"
        aria-label={i18n.t("font.larger")}
        disabled={!editable || size === null || size >= max}
        onMouseDown={keep}
        onClick={() => step(1)}
      >
        <PageIcon name="plus" />
        <Tip label={i18n.t("font.larger")} />
      </button>
    </span>
  );
}
