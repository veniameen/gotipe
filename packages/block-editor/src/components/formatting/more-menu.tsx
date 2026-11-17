import { type Block, type GoTipeEditor, GoTipeError, copySelection } from "@gotipe/core";
import { setTextAlign } from "@gotipe/core/extensions";
import { serializeMarkdown } from "@gotipe/markdown";
import { useEffect, useRef, useState } from "react";
import { useBlockEditorI18n } from "../../i18n/strings";
import { PageIcon } from "../../page/icons";
import { AlignOptions, useAlignable, useTextAlign } from "../../text/align";
import { hasMark } from "./schema";
import { Tip } from "./tip";
import { useFormattingMenu } from "./use-formatting-menu";

/** Marks “More” offers when the editor has them (`Superscript`, `Subscript`: not in DefaultPreset). */
const SCRIPTS = ["superscript", "subscript"] as const;

export function MoreMenu({ editor }: { editor: GoTipeEditor }) {
  const menu = useFormattingMenu(editor);
  const i18n = useBlockEditorI18n();
  const markdown = useRef("");
  const generation = useRef(0);
  const [copying, setCopying] = useState(false);
  const align = useTextAlign(editor);
  const alignable = useAlignable(editor);
  const scripts = SCRIPTS.filter((mark) => hasMark(editor, mark));
  useEffect(() => {
    if (!menu.open) {
      generation.current++;
      setCopying(false);
    }
    return () => {
      generation.current++;
    };
  }, [menu.open]);
  const show = () => {
    const payload = copySelection(editor.getJSON(), editor.getViewState().selection);
    const blocks: Block[] =
      payload && "blocks" in payload
        ? payload.blocks
        : payload
          ? [
              {
                id: "selection",
                type: "paragraph",
                attrs: {},
                content: payload.spans,
                children: [],
              },
            ]
          : [];
    // The serializer adds one document newline. Selected trailing spaces belong
    // to the user's text and must survive copying.
    markdown.current = serializeMarkdown({ version: 0, blocks }).text.replace(/\r?\n$/, "");
    menu.show();
  };
  const copy = async () => {
    if (copying || !menu.editable) return;
    const current = ++generation.current;
    setCopying(true);
    try {
      const clipboard = editor.element?.ownerDocument.defaultView?.navigator.clipboard;
      if (!clipboard) throw new Error("Clipboard is unavailable in this browser context.");
      await clipboard.writeText(markdown.current);
      if (current === generation.current && !editor.isDestroyed) menu.close(true);
    } catch (failure) {
      if (current !== generation.current || editor.isDestroyed) return;
      const message = failure instanceof Error ? failure.message : String(failure);
      menu.setError(i18n.t("format.copyFailed", { message }));
      editor.reportError(new GoTipeError("CLIPBOARD_FAILED", message));
    } finally {
      if (current === generation.current) setCopying(false);
    }
  };
  return (
    <div>
      <button
        ref={menu.trigger}
        type="button"
        aria-label={i18n.t("editor.moreFormatting")}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        disabled={!menu.editable}
        onClick={() => (menu.open ? menu.close() : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            show();
            requestAnimationFrame(() =>
              menu.popup.current?.querySelector<HTMLButtonElement>("button")?.focus(),
            );
          }
        }}
      >
        <PageIcon name="more" />
        <Tip label={i18n.t("editor.more")} />
      </button>
      {menu.open && (
        <div
          ref={menu.popup}
          className="gotipe-block-more-menu"
          role="menu"
          aria-label={i18n.t("format.more")}
          data-gotipe-formatting-popup=""
          style={menu.style}
          onKeyDown={menu.keydown}
        >
          {/* Atlas frame 27: alignment belongs to the block, its keys beside each row */}
          <div className="gotipe-menu-group" role="group" aria-label={i18n.t("align.label")}>
            <span className="gotipe-menu-label" aria-hidden="true">
              {i18n.t("align.label")}
            </span>
            <AlignOptions
              current={align}
              disabled={!alignable}
              pick={(value) => menu.apply(() => setTextAlign(editor, value))}
            />
          </div>
          <div className="gotipe-menu-sep" role="separator" />
          {scripts.map((mark) => (
            <button
              key={mark}
              type="button"
              role="menuitem"
              data-mark={mark}
              onClick={() => menu.run((chain) => chain.toggleMark(mark))}
            >
              {i18n.t(`format.${mark}`)}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => menu.run((chain) => chain.clearFormatting())}
          >
            {i18n.t("format.clear")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={copying || !markdown.current}
            onClick={() => void copy()}
          >
            {i18n.t(copying ? "format.copying" : "format.copyMarkdown")}
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
