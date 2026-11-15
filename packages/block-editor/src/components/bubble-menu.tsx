import { type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { BubbleMenu } from "@gotipe/react";
import { useCallback } from "react";
import { useBlockEditorI18n } from "../i18n/strings";
import { PageIcon, type PageIconName } from "../page/icons";
import { aiControls } from "./ai-controls";
import { BlockTypeDropdown } from "./block-type-dropdown";
import { MARK_KEYS, ariaKeys } from "./formatting/keys";
import { LinkEditor } from "./formatting/link-editor";
import { MoreMenu } from "./formatting/more-menu";
import { Tip } from "./formatting/tip";
import { TextColorPicker } from "./text-color-picker";

export interface BlockEditorBubbleMenuProps {
  editor: GoTipeEditor;
  /** Improve first, when the editor has `defineAi` and `defineAiContext`, which answer it. */
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
  mark: string;
  icon: PageIconName;
  binding: string;
  active: boolean;
  onClick: () => void;
}

function FormatButton({ label, mark, icon, binding, active, onClick }: FormatButtonProps) {
  return (
    <button
      type="button"
      className={active ? "active" : ""}
      aria-label={label}
      aria-pressed={active}
      aria-keyshortcuts={ariaKeys(binding)}
      data-mark={mark}
      onClick={onClick}
    >
      <PageIcon name={icon} />
      <Tip label={label} binding={binding} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  More menu (Superscript, Subscript, Clear Formatting, Copy as MD)  */
/* ------------------------------------------------------------------ */

export function BlockEditorBubbleMenu({ editor, enableAI = false }: BlockEditorBubbleMenuProps) {
  const i18n = useBlockEditorI18n();
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
  const improve = enableAI && aiControls(editor).improve;

  return (
    <BubbleMenu editor={editor} ariaLabel={i18n.t("a11y.toolbarLabel")}>
      {() => (
        <>
          {/* AI Improve — only when an AI extension answers it */}
          {improve && (
            <>
              <button
                type="button"
                className="gotipe-bubble-model"
                aria-label={i18n.t("editor.improveLabel")}
                onClick={handleAIImprove}
              >
                <PageIcon name="sparkle" />
                {i18n.t("editor.improve")}
              </button>
              <Separator />
            </>
          )}

          {/* Block Type dropdown */}
          <BlockTypeDropdown editor={editor} />
          <Separator />

          {/* Formatting buttons */}
          <FormatButton
            label={i18n.t("toolbar.bold")}
            mark="bold"
            icon="bold"
            binding={MARK_KEYS.bold}
            active={isMarkActive(editor, "bold")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("bold");
              })
            }
          />
          <FormatButton
            label={i18n.t("toolbar.italic")}
            mark="italic"
            icon="italic"
            binding={MARK_KEYS.italic}
            active={isMarkActive(editor, "italic")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("italic");
              })
            }
          />
          <FormatButton
            label={i18n.t("toolbar.underline")}
            mark="underline"
            icon="underline"
            binding={MARK_KEYS.underline}
            active={isMarkActive(editor, "underline")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("underline");
              })
            }
          />
          <FormatButton
            label={i18n.t("toolbar.strikethrough")}
            mark="strikethrough"
            icon="strike"
            binding={MARK_KEYS.strikethrough}
            active={isMarkActive(editor, "strikethrough")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("strikethrough");
              })
            }
          />
          <FormatButton
            label={i18n.t("toolbar.code")}
            mark="code"
            icon="inlineCode"
            binding={MARK_KEYS.code}
            active={isMarkActive(editor, "code")}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleMark("code");
              })
            }
          />
          <LinkEditor editor={editor} atSelection />
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
