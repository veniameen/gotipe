import type React from "react";
import { useEffect, useRef } from "react";
import { useBlockEditorI18n } from "../i18n/strings";
import { PageIcon } from "../page/icons";
import { Tip } from "./formatting/tip";

export interface PageHeadProps {
  /** The page's glyph chosen by the host. */
  icon?: React.ReactNode;
  /** Offers to add a glyph while the head is hovered; shown when there is none. */
  onAddIcon?: () => void;
  /** Plain-text title. It is editable when `onTitleChange` is given and the page is not read-only. */
  title: string;
  onTitleChange?: (title: string) => void;
  /** Enter in the title, e.g. to move the caret into the document. */
  onTitleEnter?: () => void;
  /** Shown while the title is empty. */
  placeholder?: string;
  /** The host's slot under the title: who wrote the page and when it changed. */
  byline?: React.ReactNode;
  /** Marks the page read-only; a string is the reason, shown on hover. */
  readOnly?: boolean | string;
  labels?: { addIcon?: string; readOnly?: string };
}

/**
 * The head of a page (GoTipe Atlas, frames 1, 2, 11 and 17): the glyph, the title, the host's byline
 * and the read-only sign. Pass it to `BlockEditor` as `header`; the host owns the title's value.
 */
export function PageHead({
  icon,
  onAddIcon,
  title,
  onTitleChange,
  onTitleEnter,
  placeholder,
  byline,
  readOnly,
  labels,
}: PageHeadProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const i18n = useBlockEditorI18n();
  const hint = placeholder ?? i18n.t("page.titlePlaceholder");
  const editable = !!onTitleChange && !readOnly;
  // The title is uncontrolled while it has focus: React never rewrites text under the caret.
  useEffect(() => {
    const element = titleRef.current;
    if (!element || element.textContent === title) return;
    if (element.ownerDocument.activeElement !== element) element.textContent = title;
  }, [title]);
  const reason =
    typeof readOnly === "string" ? readOnly : (labels?.readOnly ?? i18n.t("page.readOnly"));
  return (
    <header className="gotipe-page-head" data-gotipe-page-head="">
      {icon ? (
        <div className="gotipe-page-head-icon">{icon}</div>
      ) : onAddIcon && !readOnly ? (
        <button type="button" className="gotipe-page-head-add" onClick={onAddIcon}>
          <PageIcon name="plus" />
          {labels?.addIcon ?? i18n.t("page.addIcon")}
        </button>
      ) : null}
      <div className="gotipe-page-head-line">
        <h1
          ref={titleRef}
          className="gotipe-page-head-title"
          data-empty={title ? undefined : ""}
          data-placeholder={hint}
          contentEditable={editable ? "plaintext-only" : undefined}
          suppressContentEditableWarning
          spellCheck={editable}
          role={editable ? "textbox" : undefined}
          aria-label={editable ? hint : undefined}
          onInput={(event) => onTitleChange?.(event.currentTarget.textContent ?? "")}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            onTitleEnter?.();
          }}
        />
        {readOnly ? (
          // a button only to be reachable by the keys: it shows the reason, it does nothing else
          <button type="button" className="gotipe-page-head-lock" aria-label={reason}>
            <PageIcon name="lock" />
            <Tip label={reason} />
          </button>
        ) : null}
      </div>
      {byline ? <div className="gotipe-page-head-byline">{byline}</div> : null}
    </header>
  );
}
