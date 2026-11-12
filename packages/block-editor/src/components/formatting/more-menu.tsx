import { type Block, type GoTipeEditor, GoTipeError, copySelection } from "@gotipe/core";
import { serializeMarkdown } from "@gotipe/markdown";
import { useGoTipeI18n } from "@gotipe/react";
import { useEffect, useRef, useState } from "react";
import { PageIcon } from "../../page/icons";
import { Tip } from "./tip";
import { useFormattingMenu } from "./use-formatting-menu";

export function MoreMenu({ editor }: { editor: GoTipeEditor }) {
  const menu = useFormattingMenu(editor);
  const i18n = useGoTipeI18n();
  const markdown = useRef("");
  const generation = useRef(0);
  const [copying, setCopying] = useState(false);
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
          <button
            type="button"
            role="menuitem"
            onClick={() => menu.run((chain) => chain.toggleMark("superscript"))}
          >
            {i18n.t("format.superscript")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => menu.run((chain) => chain.toggleMark("subscript"))}
          >
            {i18n.t("format.subscript")}
          </button>
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
