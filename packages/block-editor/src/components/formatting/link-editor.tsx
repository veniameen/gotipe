import { type GoTipeEditor, toSafeHref } from "@gotipe/core";
import { useGoTipeI18n } from "@gotipe/react";
import { useEffect, useRef, useState } from "react";
import { PageIcon } from "../../page/icons";
import { MARK_KEYS, ariaKeys } from "./keys";
import { currentMarks } from "./selection";
import { Tip } from "./tip";
import { useFormattingMenu } from "./use-formatting-menu";

export function LinkEditor({ editor }: { editor: GoTipeEditor }) {
  const menu = useFormattingMenu(editor);
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const mark = currentMarks(editor).find((item) => item.type === "link");
  const i18n = useGoTipeI18n();
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
      menu.setError(i18n.t("format.linkInvalid"));
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
        aria-label={i18n.t("toolbar.link")}
        aria-keyshortcuts={ariaKeys(MARK_KEYS.link)}
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        aria-pressed={!!mark}
        data-mark="link"
        className={mark ? "active" : ""}
        disabled={!menu.editable}
        onClick={() => (menu.open ? menu.close() : open())}
      >
        <PageIcon name="link" />
        <Tip label={i18n.t("toolbar.link")} binding={MARK_KEYS.link} />
      </button>
      {menu.open && (
        <div
          ref={menu.popup}
          role="dialog"
          aria-label={i18n.t("format.linkDialog")}
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
              <span className="gotipe-sr-only">{i18n.t("format.linkAddress")}</span>
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
                aria-label={i18n.t("format.applyLink")}
                title={i18n.t("format.applyLink")}
                disabled={!url.trim()}
              >
                <PageIcon name="check" />
              </button>
              {mark && (
                <button
                  type="button"
                  aria-label={i18n.t("format.unlink")}
                  title={i18n.t("format.unlink")}
                  onClick={() => menu.run((chain) => chain.unsetMark("link"))}
                >
                  <PageIcon name="unlink" />
                </button>
              )}
              <button
                type="button"
                aria-label={i18n.t("format.cancel")}
                title={i18n.t("format.cancel")}
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
