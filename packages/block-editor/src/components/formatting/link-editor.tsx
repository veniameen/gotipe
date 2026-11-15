import { type GoTipeEditor, type ViewState, toSafeHref } from "@gotipe/core";
import { useEditorState } from "@gotipe/react";
import { useEffect, useId, useRef, useState } from "react";
import { useBlockEditorI18n } from "../../i18n/strings";
import { PageIcon } from "../../page/icons";
import { MARK_KEYS, ariaKeys } from "./keys";
import { offerLinkField, reachable } from "./link-shortcut";
import { useFormatReason } from "./reasons";
import { marksAt } from "./selection";
import { Tip } from "./tip";
import { useFormattingMenu } from "./use-formatting-menu";

/** The address of the link at the selection's anchor; `null` outside a link. */
function linkAt(state: ViewState): string | null {
  const link = marksAt(state).find((item) => item.type === "link");
  if (!link) return null;
  return typeof link.attrs?.href === "string" ? link.attrs.href : "";
}

/**
 * The Link tool and its field. Mod+K opens the field too (`openLinkDialog`); `atSelection` marks
 * the tool that stands at the selection (the bubble), whose field the key opens first.
 */
export function LinkEditor({
  editor,
  atSelection = false,
}: { editor: GoTipeEditor; atSelection?: boolean }) {
  const menu = useFormattingMenu(editor, { returnTo: "text" });
  const [url, setUrl] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // the tool follows the link under the caret wherever it stands: in the bubble or in the
  // fixed toolbar, which does not draw again on a selection change
  const linked = (useEditorState(editor, linkAt) ?? null) !== null;
  const i18n = useBlockEditorI18n();
  const reason = useFormatReason(editor);
  const tip = useId();
  const open = () => {
    // read now: Mod+K can come right after a selection change, before the tool draws again
    setUrl(linkAt(editor.getViewState()) ?? "");
    menu.show();
  };
  useEffect(() => {
    if (menu.open) input.current?.focus();
  }, [menu.open]);
  // the key reads this render's state: why the tool can't act, whether the field is open
  const byKey = useRef<() => boolean>(() => false);
  byKey.current = () => {
    if (reason || !reachable(menu.trigger.current)) return false;
    if (menu.open) input.current?.focus();
    else open();
    return true;
  };
  useEffect(
    () => offerLinkField(editor, { atSelection, open: () => byKey.current() }),
    [editor, atSelection],
  );
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
        aria-pressed={linked}
        aria-disabled={reason ? true : undefined}
        aria-describedby={reason ? tip : undefined}
        data-mark="link"
        className={linked ? "gotipe-format-tool active" : "gotipe-format-tool"}
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
              {linked && (
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
