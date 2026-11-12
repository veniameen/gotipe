import {
  DOCUMENT_HIGHLIGHT_COLORS,
  DOCUMENT_TEXT_COLORS,
  type GoTipeEditor,
  documentColorStyle,
  toSafeColor,
} from "@gotipe/core";
import { useEditorState } from "@gotipe/react";
import { useGoTipeI18n } from "@gotipe/react";
import type React from "react";
import { PageIcon } from "../page/icons";
import { currentMarks } from "./formatting/selection";
import { Tip } from "./formatting/tip";
import { useFormattingMenu } from "./formatting/use-formatting-menu";

export interface TextColorPickerProps {
  editor: GoTipeEditor;
}

/**
 * Text and background colours of the document (GoTipe Atlas, frame 6): one row of swatches. A
 * mark stores the palette's light value; the editor renders it through the theme token.
 */
export function TextColorPicker({ editor }: TextColorPickerProps) {
  useEditorState(editor, (value) => value);
  const menu = useFormattingMenu(editor);
  const marks = currentMarks(editor);
  const stored = (type: string) =>
    toSafeColor(marks.find((mark) => mark.type === type)?.attrs.color);
  const textColor = stored("textColor");
  const highlight = stored("highlight");
  const current = documentColorStyle(textColor ?? highlight);
  const i18n = useGoTipeI18n();
  const colorName = (name: string) => i18n.t(`color.${name}` as Parameters<typeof i18n.t>[0]);
  return (
    <div>
      <button
        type="button"
        ref={menu.trigger}
        className="gotipe-color-trigger"
        disabled={!menu.editable}
        onClick={() => (menu.open ? menu.close() : menu.show())}
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        aria-label={i18n.t("editor.textColor")}
        style={current ? ({ "--gt-color-current": current } as React.CSSProperties) : undefined}
      >
        <PageIcon name="letter" />
        <span className="gotipe-color-bar" aria-hidden="true" />
        <Tip label={i18n.t("editor.color")} />
      </button>

      {menu.open && (
        <div
          ref={menu.popup}
          className="gotipe-text-color-picker"
          role="dialog"
          aria-label={i18n.t("color.dialog")}
          data-gotipe-color-picker=""
          data-gotipe-formatting-popup=""
          style={menu.style}
          onKeyDown={menu.keydown}
        >
          <div className="gotipe-color-group" role="group" aria-label={i18n.t("color.text")}>
            {DOCUMENT_TEXT_COLORS.map((color) => (
              <button
                key={`tc-${color.name}`}
                type="button"
                className="gotipe-text-color-swatch"
                aria-label={i18n.t("color.textOption", { name: colorName(color.name) })}
                aria-pressed={textColor === color.value}
                style={{ color: documentColorStyle(color.value) ?? undefined }}
                onClick={() =>
                  menu.run((chain) => chain.setMark("textColor", { color: color.value }))
                }
              >
                <PageIcon name="letter" />
                <Tip label={colorName(color.name)} />
              </button>
            ))}
          </div>
          <span className="gotipe-color-sep" aria-hidden="true" />
          <div className="gotipe-color-group" role="group" aria-label={i18n.t("color.highlight")}>
            {DOCUMENT_HIGHLIGHT_COLORS.map((color) => (
              <button
                key={`hl-${color.name}`}
                type="button"
                className="gotipe-text-color-swatch is-fill"
                aria-label={i18n.t("color.highlightOption", { name: colorName(color.name) })}
                aria-pressed={highlight === color.value}
                style={{ background: documentColorStyle(color.value) ?? undefined }}
                onClick={() =>
                  menu.run((chain) => chain.setMark("highlight", { color: color.value }))
                }
              >
                <Tip label={colorName(color.name)} />
              </button>
            ))}
          </div>
          <span className="gotipe-color-sep" aria-hidden="true" />
          <button
            type="button"
            className="gotipe-text-color-reset"
            aria-label={i18n.t("color.reset")}
            onClick={() => menu.run((chain) => chain.unsetMark("highlight").unsetMark("textColor"))}
          >
            <PageIcon name="close" />
            <Tip label={i18n.t("color.reset")} />
          </button>
          {menu.error && (
            <p role="alert" className="gotipe-sr-only">
              {menu.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
