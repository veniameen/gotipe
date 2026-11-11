import { type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { BubbleMenu } from "@gotipe/react";
import { useCallback } from "react";
import { PageIcon, type PageIconName } from "../page/icons";
import { BlockTypeDropdown } from "./block-type-dropdown";
import { LinkEditor } from "./formatting/link-editor";
import { MoreMenu } from "./formatting/more-menu";
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
  return (state.toolbar.activeMarks ?? []).includes(markType);
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
  icon: PageIconName;
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
      <PageIcon name={icon} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  More menu (Superscript, Subscript, Clear Formatting, Copy as MD)  */
/* ------------------------------------------------------------------ */

export function BlockEditorBubbleMenu({ editor, enableAI = false }: BlockEditorBubbleMenuProps) {
  const runWithFocus = useCallback(
    (apply: (chain: ReturnType<GoTipeEditor["chain"]>) => void) => {
      if (!editor.isEditable || editor.isDestroyed) return;
      try {
        const chain = editor.chain().focus();
        apply(chain);
        if (!chain.run()) throw new Error("The editor declined the formatting change");
      } catch (failure) {
        editor.reportError(
          new GoTipeError(
            "TRANSFORM_ERROR",
            failure instanceof Error ? failure.message : String(failure),
          ),
        );
      }
    },
    [editor],
  );

  const handleAIImprove = useCallback(() => {
    editor.emit("executeAiCommand", { commandId: "rewrite" });
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
                className="gotipe-bubble-model"
                aria-label="AI Improve"
                onClick={handleAIImprove}
              >
                <PageIcon name="sparkle" />
                Improve
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
            icon="bold"
            active={isMarkActive(editor, "bold")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("bold");
              })
            }
          />
          <FormatButton
            label="Italic"
            icon="italic"
            active={isMarkActive(editor, "italic")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("italic");
              })
            }
          />
          <FormatButton
            label="Underline"
            icon="underline"
            active={isMarkActive(editor, "underline")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("underline");
              })
            }
          />
          <FormatButton
            label="Strikethrough"
            icon="strike"
            active={isMarkActive(editor, "strikethrough")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("strikethrough");
              })
            }
          />
          <FormatButton
            label="Code"
            icon="inlineCode"
            active={isMarkActive(editor, "code")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("code");
              })
            }
          />
          <LinkEditor editor={editor} />
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
