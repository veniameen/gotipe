import { type GoTipeEditor, toSafeHref } from "@gotipe/core";
import { useEffect, useRef, useState } from "react";
import { PageIcon } from "../../page/icons";
import { currentMarks } from "./selection";
import { useFormattingMenu } from "./use-formatting-menu";

export function LinkEditor({ editor }: { editor: GoTipeEditor }) {
  const menu = useFormattingMenu(editor);
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const mark = currentMarks(editor).find((item) => item.type === "link");
  const open = () => {
    setUrl(typeof mark?.attrs?.href === "string" ? mark.attrs.href : "");
    menu.show();
  };
  useEffect(() => {
    if (menu.open) input.current?.focus();
  }, [menu.open]);
  const apply = () => {
    const href = toSafeHref(url);
    if (!href) {
      menu.setError("Enter a web address, email link, or relative URL.");
      input.current?.focus();
      return;
    }
    menu.run((chain) => chain.setMark("link", { href }));
  };
  return (
    <div>
      <button
        ref={menu.trigger}
        type="button"
        aria-label="Link"
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        aria-pressed={!!mark}
        data-mark="link"
        className={mark ? "active" : ""}
        disabled={!menu.editable}
        onClick={() => (menu.open ? menu.close() : open())}
      >
        <PageIcon name="link" />
      </button>
      {menu.open && (
        <div
          ref={menu.popup}
          role="dialog"
          aria-label="Edit link"
          className="gotipe-link-editor"
          data-gotipe-formatting-popup=""
          style={menu.style}
          onKeyDown={menu.keydown}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
          >
            <label className="gotipe-link-editor-field">
              <PageIcon name="link" />
              <span className="gotipe-sr-only">Link address</span>
              <input
                ref={input}
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  menu.setError(null);
                }}
                placeholder="https://example.com"
                type="text"
                inputMode="url"
                autoComplete="off"
                aria-invalid={!!menu.error}
              />
            </label>
            <div className="gotipe-link-editor-actions">
              <button
                type="submit"
                aria-label="Apply link"
                title="Apply link"
                disabled={!url.trim()}
              >
                <PageIcon name="check" />
              </button>
              {mark && (
                <button
                  type="button"
                  aria-label="Remove link"
                  title="Remove link"
                  onClick={() => menu.run((chain) => chain.unsetMark("link"))}
                >
                  <PageIcon name="unlink" />
                </button>
              )}
              <button
                type="button"
                aria-label="Cancel"
                title="Cancel"
                onClick={() => menu.close(true)}
              >
                <PageIcon name="close" />
              </button>
            </div>
            {menu.error && (
              <p role="alert" className="gotipe-sr-only">
                {menu.error}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
