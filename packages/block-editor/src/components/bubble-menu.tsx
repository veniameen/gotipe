import type { GoTipeEditor } from "@gotipe/core";
import { BubbleMenu } from "@gotipe/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BlockTypeDropdown } from "./block-type-dropdown";
import { TextColorPicker } from "./text-color-picker";

export interface BlockEditorBubbleMenuProps {
  editor: GoTipeEditor;
  enableAI?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Mark toggle helpers                                                */
/* ------------------------------------------------------------------ */

function isMarkActive(editor: GoTipeEditor, markType: string): boolean {
  const state = editor.getViewState();
  return (state.activeMarks ?? []).some((m) => m.type === markType);
}

/* ------------------------------------------------------------------ */
/*  Separator                                                          */
/* ------------------------------------------------------------------ */

function Separator() {
  return <div className="gotipe-bubble-menu-separator" />;
}

/* ------------------------------------------------------------------ */
/*  Formatting buttons                                                 */
/* ------------------------------------------------------------------ */

interface FormatButtonProps {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}

function FormatButton({ label, icon, active, onClick }: FormatButtonProps) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      aria-label={label}
      aria-pressed={active}
      data-mark={label.toLowerCase()}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  More menu (Superscript, Subscript, Clear Formatting, Copy as MD)  */
/* ------------------------------------------------------------------ */

interface MoreMenuProps {
  editor: GoTipeEditor;
}

function MoreMenu({ editor }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleClearFormatting = useCallback(() => {
    editor.chain().clearFormatting().run();
    setOpen(false);
  }, [editor]);

  const handleCopyAsMarkdown = useCallback(async () => {
    const md = editor.exportMarkdown();
    if (md) {
      await navigator.clipboard.writeText(md);
    }
    setOpen(false);
  }, [editor]);

  const handleToggleSuperscript = useCallback(() => {
    editor.chain().toggleMark("superscript").run();
    setOpen(false);
  }, [editor]);

  const handleToggleSubscript = useCallback(() => {
    editor.chain().toggleMark("subscript").run();
    setOpen(false);
  }, [editor]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="More formatting options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {"\u22EE"}
      </button>

      {open && (
        <div
          className="gotipe-block-more-menu"
          role="menu"
          style={{ right: 0, left: "auto" }}
        >
          <button type="button" role="menuitem" onClick={handleToggleSuperscript}>
            Superscript
          </button>
          <button type="button" role="menuitem" onClick={handleToggleSubscript}>
            Subscript
          </button>
          <button type="button" role="menuitem" onClick={handleClearFormatting}>
            Clear Formatting
          </button>
          <button type="button" role="menuitem" onClick={handleCopyAsMarkdown}>
            Copy as Markdown
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function BlockEditorBubbleMenu({ editor, enableAI = false }: BlockEditorBubbleMenuProps) {
  const handleAIImprove = useCallback(() => {
    editor.emit("executeAiCommand", { commandId: "rewrite" });
  }, [editor]);

  const marks = useMemo(() => {
    const state = editor.getViewState();
    return state.activeMarks ?? [];
  }, [editor]);

  return (
    <BubbleMenu editor={editor}>
      {() => (
        <>
          {/* AI Improve — only when AI extension loaded */}
          {enableAI && (
            <>
              <button
                type="button"
                aria-label="AI Improve"
                onClick={handleAIImprove}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  height: "32px",
                  padding: "0 8px",
                  border: "none",
                  borderRadius: "var(--gt-radius-lg, 12px)",
                  background: "transparent",
                  color: "var(--gt-text-secondary)",
                  fontSize: "var(--gt-text-sm, 14px)",
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {"\u2728"} Improve
              </button>
              <Separator />
            </>
          )}

          {/* Block Type dropdown */}
          <BlockTypeDropdown editor={editor} />
          <Separator />

          {/* Formatting buttons */}
          <FormatButton
            label="Bold"
            icon="B"
            active={isMarkActive(editor, "bold")}
            onClick={() => editor.chain().toggleMark("bold").run()}
          />
          <FormatButton
            label="Italic"
            icon="I"
            active={isMarkActive(editor, "italic")}
            onClick={() => editor.chain().toggleMark("italic").run()}
          />
          <FormatButton
            label="Underline"
            icon="U"
            active={isMarkActive(editor, "underline")}
            onClick={() => editor.chain().toggleMark("underline").run()}
          />
          <FormatButton
            label="Strikethrough"
            icon="S"
            active={isMarkActive(editor, "strikethrough")}
            onClick={() => editor.chain().toggleMark("strikethrough").run()}
          />
          <FormatButton
            label="Code"
            icon="</>"
            active={isMarkActive(editor, "code")}
            onClick={() => editor.chain().toggleMark("code").run()}
          />
          <FormatButton
            label="Link"
            icon={"\uD83D\uDD17"}
            active={isMarkActive(editor, "link")}
            onClick={() => {
              if (isMarkActive(editor, "link")) {
                editor.chain().unsetMark("link").run();
              } else {
                const url = window.prompt("Enter URL:");
                if (url) {
                  editor.chain().setMark("link", { href: url }).run();
                }
              }
            }}
          />
          <Separator />

          {/* Text Color picker */}
          <TextColorPicker editor={editor} />
          <Separator />

          {/* More menu */}
          <MoreMenu editor={editor} />
        </>
      )}
    </BubbleMenu>
  );
}
