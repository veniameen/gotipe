import { type GoTipeEditor, toSafeHref } from "@gotipe/core";
import { BubbleMenu, useGoTipeI18n } from "@gotipe/react";
import { useEffect, useRef, useState } from "react";
import { currentMarks } from "../components/formatting/selection";
import { PageIcon, type PageIconName } from "./icons";

const MARKS: {
  mark: string;
  icon: PageIconName;
  label: "toolbar.bold" | "toolbar.italic" | "toolbar.strikethrough" | "toolbar.code";
  run: (e: GoTipeEditor) => void;
}[] = [
  {
    mark: "bold",
    icon: "bold",
    label: "toolbar.bold",
    run: (e) => e.chain().toggleBold().focus().run(),
  },
  {
    mark: "italic",
    icon: "italic",
    label: "toolbar.italic",
    run: (e) => e.chain().toggleItalic().focus().run(),
  },
  {
    mark: "strikethrough",
    icon: "strike",
    label: "toolbar.strikethrough",
    run: (e) => e.chain().toggleStrikethrough().focus().run(),
  },
  {
    mark: "code",
    icon: "inlineCode",
    label: "toolbar.code",
    run: (e) => e.chain().toggleCode().focus().run(),
  },
];

/**
 * The floating panel over a text selection: bold, italic, strike, code, link.
 * An invalid link is shown by highlighting the field — no error text.
 */
export function PageBubbleMenu({ editor }: { editor: GoTipeEditor }) {
  const i18n = useGoTipeI18n();
  const [linkMode, setLinkMode] = useState(false);
  const [href, setHref] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (linkMode) inputRef.current?.focus();
  }, [linkMode]);

  useEffect(() => editor.on("selectionChange", () => setLinkMode(false)), [editor]);

  const applyLink = () => {
    const value = href.trim();
    if (!value) {
      editor.chain().removeLink().focus().run();
      setLinkMode(false);
      return;
    }
    const safe = toSafeHref(value);
    if (!safe) {
      setInvalid(true);
      return;
    }
    editor.chain().setLink(safe).focus().run();
    setLinkMode(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      className="gotipe-page-bubble"
      ariaLabel={i18n.t("format.label")}
      shouldShow={({ state }) => {
        if (!editor.isEditable) return false;
        const sel = state.selection;
        if (sel.anchor.blockId === sel.head.blockId && sel.anchor.offset === sel.head.offset)
          return false;
        const block = editor.getCurrentBlock();
        return !block || (block.type !== "codeBlock" && block.type !== "markdownRaw");
      }}
    >
      {linkMode ? (
        <form
          className="gotipe-page-bubble-link"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            ref={inputRef}
            value={href}
            placeholder={i18n.t("format.linkPlaceholder")}
            aria-label={i18n.t("format.link")}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              setHref(e.target.value);
              setInvalid(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setLinkMode(false);
                editor.focus();
              }
            }}
          />
          <button type="submit" className="gotipe-page-icon-btn" aria-label={i18n.t("format.link")}>
            <PageIcon name="check" />
          </button>
        </form>
      ) : (
        <>
          {MARKS.map((m) => (
            <button
              key={m.mark}
              type="button"
              className={`gotipe-page-icon-btn${editor.isActive(m.mark) ? " is-on" : ""}`}
              aria-label={i18n.t(m.label)}
              aria-pressed={editor.isActive(m.mark)}
              onClick={() => m.run(editor)}
            >
              <PageIcon name={m.icon} />
            </button>
          ))}
          <span className="gotipe-page-bubble-sep" aria-hidden="true" />
          <button
            type="button"
            className={`gotipe-page-icon-btn${editor.isActive("link") ? " is-on" : ""}`}
            aria-label={i18n.t("format.link")}
            onClick={() => {
              const link = currentMarks(editor).find((mark) => mark.type === "link");
              setHref(typeof link?.attrs.href === "string" ? link.attrs.href : "");
              setInvalid(false);
              setLinkMode(true);
            }}
          >
            <PageIcon name="link" />
          </button>
        </>
      )}
    </BubbleMenu>
  );
}
