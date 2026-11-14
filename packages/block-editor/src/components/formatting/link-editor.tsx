import { type GoTipeEditor, toSafeHref } from "@gotipe/core";
import { useEffect, useId, useRef, useState } from "react";
import { useBlockEditorI18n } from "../../i18n/strings";
import { PageIcon } from "../../page/icons";
import { MARK_KEYS, ariaKeys } from "./keys";
import { useFormatReason } from "./reasons";
import { currentMarks } from "./selection";
import { Tip } from "./tip";
import { useFormattingMenu } from "./use-formatting-menu";

export function LinkEditor({ editor }: { editor: GoTipeEditor }) {
  const menu = useFormattingMenu(editor, { returnTo: "text" });
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const mark = currentMarks(editor).find((item) => item.type === "link");
  const i18n = useBlockEditorI18n();
  const reason = useFormatReason(editor);
  const tip = useId();
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
        aria-disabled={reason ? true : undefined}
        aria-describedby={reason ? tip : undefined}
        data-mark="link"
        className={mark ? "gotipe-format-tool active" : "gotipe-format-tool"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (reason) return;
          if (menu.open) menu.close();
          else open();
        }}
      >
        <PageIcon name="link" />
        <Tip
          id={tip}
          label={reason ?? i18n.t("toolbar.link")}
          binding={reason ? undefined : MARK_KEYS.link}
        />
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
              <button type="submit" aria-label={i18n.t("format.applyLink")} disabled={!url.trim()}>
                <PageIcon name="check" />
                <Tip label={i18n.t("format.applyLink")} />
              </button>
              {mark && (
                <button
                  type="button"
                  aria-label={i18n.t("format.unlink")}
                  onClick={() => menu.run((chain) => chain.unsetMark("link"))}
                >
                  <PageIcon name="unlink" />
                  <Tip label={i18n.t("format.unlink")} />
                </button>
              )}
              <button
                type="button"
                aria-label={i18n.t("format.cancel")}
                onClick={() => menu.close(true)}
              >
                <PageIcon name="close" />
                <Tip label={i18n.t("format.cancel")} />
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
