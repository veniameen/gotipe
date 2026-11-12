import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { type ReactNode, useState } from "react";
import { useGoTipeI18n } from "../i18n-context";
import { usePhantom } from "./context";
import { ContentIcon, calloutIconOf } from "./icons";

interface Props {
  block: BlockView;
  editor: GoTipeEditor;
  rootProps: Record<string, unknown>;
  content: ReactNode;
  children: ReactNode;
}

export function ToggleBlock({ block, editor, rootProps, content, children }: Props) {
  const readOnly = usePhantom() || !editor.isEditable;
  const sourceOpen = !!block.attrs.open;
  const [preview, setPreview] = useState<{ source: boolean; open: boolean } | null>(null);
  const isOpen = readOnly && preview?.source === sourceOpen ? preview.open : sourceOpen;
  const i18n = useGoTipeI18n();
  return (
    <details
      {...rootProps}
      data-block-type={block.type}
      className={["gotipe-toggle", rootProps.className].filter(Boolean).join(" ")}
      open={isOpen}
    >
      <summary onClick={(event) => event.preventDefault()} tabIndex={-1}>
        <button
          type="button"
          contentEditable={false}
          data-gotipe-widget=""
          className="gotipe-toggle-button"
          aria-label={i18n.t(isOpen ? "toggle.collapse" : "toggle.expand")}
          aria-expanded={isOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (readOnly) setPreview({ source: sourceOpen, open: !isOpen });
            else editor.chain().setBlockAttrs(block.id, { open: !isOpen }).run();
          }}
        >
          <ContentIcon name="chevron" />
        </button>
        {content}
      </summary>
      <div className="gotipe-toggle-content">{children}</div>
    </details>
  );
}

export function CalloutBlock({ block, editor, rootProps, content, children }: Props) {
  const variant = String(block.attrs.type || "info");
  const emoji = String(block.attrs.emoji || "");
  const readOnly = usePhantom() || !editor.isEditable;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emoji);
  const i18n = useGoTipeI18n();
  const save = () => {
    if (!readOnly && draft.trim())
      editor.chain().setBlockAttrs(block.id, { emoji: draft.trim() }).run();
    setEditing(false);
  };
  return (
    <div
      {...rootProps}
      data-block-type={block.type}
      data-variant={variant}
      className={["gotipe-callout", rootProps.className].filter(Boolean).join(" ")}
      role="note"
    >
      {!emoji && (
        <span className="gotipe-callout-icon" contentEditable={false} data-gotipe-widget="">
          <ContentIcon name={calloutIconOf(variant)} />
        </span>
      )}
      {emoji && (
        <span className="gotipe-callout-icon-editor" contentEditable={false} data-gotipe-widget="">
          {editing ? (
            <input
              aria-label={i18n.t("callout.icon")}
              value={draft}
              maxLength={32}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={save}
              ref={(input) => input?.focus()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  save();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="gotipe-callout-emoji"
              aria-label={i18n.t("callout.changeIcon")}
              disabled={readOnly}
              onClick={() => {
                setDraft(emoji);
                setEditing(true);
              }}
            >
              {emoji}
            </button>
          )}
        </span>
      )}
      <div className="gotipe-callout-content">
        {content}
        {children}
      </div>
    </div>
  );
}
