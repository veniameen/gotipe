import { type GoTipeEditor, toSafeHref } from "@gotipe/core";
import { useEffect, useRef, useState } from "react";
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
        🔗
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
            <label>
              Link address
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
            {menu.error && <p role="alert">{menu.error}</p>}
            <div className="gotipe-link-editor-actions">
              {mark && (
                <button type="button" onClick={() => menu.run((chain) => chain.unsetMark("link"))}>
                  Remove link
                </button>
              )}
              <button type="button" onClick={() => menu.close(true)}>
                Cancel
              </button>
              <button type="submit" disabled={!url.trim()}>
                Apply link
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
