import type { GoTipeEditor } from "@gotipe/core";
import { type RefObject, useLayoutEffect } from "react";
import { useGoTipeI18n } from "../i18n-context";

/** Keep the live text node while typing; React must not replace the native caret's node. */
export function ImageCaption({
  editor,
  blockId,
  caption,
  readOnly,
  element,
  onEmpty,
}: {
  editor: GoTipeEditor;
  blockId: string;
  caption: string;
  readOnly: boolean;
  element: RefObject<HTMLDivElement | null>;
  onEmpty: () => void;
}) {
  const i18n = useGoTipeI18n();
  useLayoutEffect(() => {
    if (element.current && element.current.textContent !== caption)
      element.current.textContent = caption;
  }, [caption, element]);
  return (
    <figcaption>
      <div
        ref={element}
        data-gotipe-input=""
        contentEditable={!readOnly}
        suppressContentEditableWarning
        aria-label={i18n.t("media.captionLabel")}
        data-caption-placeholder={readOnly ? undefined : i18n.t("media.captionPlaceholder")}
        role="textbox"
        tabIndex={readOnly ? -1 : 0}
        aria-readonly={readOnly}
        onMouseDown={(event) => event.stopPropagation()}
        onInput={(event) => {
          if (!readOnly && !editor.isDestroyed)
            editor
              .chain()
              .setBlockAttrs(blockId, { caption: event.currentTarget.textContent ?? "" })
              .run();
        }}
        onPaste={(event) => {
          if (readOnly) return;
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          const selection = window.getSelection();
          if (!selection?.rangeCount || !element.current?.contains(selection.anchorNode)) return;
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const node = document.createTextNode(text);
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          editor
            .chain()
            .setBlockAttrs(blockId, { caption: element.current.textContent ?? "" })
            .run();
        }}
        onBlur={(event) => {
          if (!event.currentTarget.textContent?.trim()) onEmpty();
        }}
      />
    </figcaption>
  );
}
