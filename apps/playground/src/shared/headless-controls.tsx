import type { GoTipeEditor } from "@gotipe/core";
import type React from "react";

interface HeadlessControlsProps {
  editor: GoTipeEditor | null;
  /** The levels the editor's `Heading` creates; other levels would do nothing. */
  headingLevels: readonly number[];
}

type CommandChain = ReturnType<GoTipeEditor["chain"]>;

/** Host-provided controls: the headless core supplies commands, this demo supplies UI. */
export function HeadlessControls({ editor, headingLevels }: HeadlessControlsProps) {
  if (!editor) return null;
  const preventFocusSteal = (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
  };
  const buttonProps = {
    type: "button" as const,
    className: "gotipe-example-button",
    onPointerDown: preventFocusSteal,
    onMouseDown: preventFocusSteal,
  };
  const runWithFocus = (apply: (chain: CommandChain) => void) => {
    const chain = editor.chain().focus();
    apply(chain);
    chain.run();
  };

  return (
    <div className="gotipe-headless-controls gotipe-example-actions">
      {/* Marks */}
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.toggleBold();
          })
        }
      >
        Bold
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.toggleItalic();
          })
        }
      >
        Italic
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.toggleStrikethrough();
          })
        }
      >
        Strike
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.toggleCode();
          })
        }
      >
        Code
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.toggleUnderline();
          })
        }
      >
        Underline
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.clearFormatting();
          })
        }
      >
        Clear marks
      </button>

      {/* Block types */}
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.setBlockType("paragraph");
          })
        }
      >
        Paragraph
      </button>
      {headingLevels.map((level) => (
        <button
          key={level}
          {...buttonProps}
          onClick={() =>
            runWithFocus((chain) => {
              chain.setBlockType("heading", { level });
            })
          }
        >
          H{level}
        </button>
      ))}

      {/* Lists */}
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.toggleBulletList();
          })
        }
      >
        Bullet list
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.toggleOrderedList();
          })
        }
      >
        Ordered list
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.toggleTodoList();
          })
        }
      >
        Task list
      </button>

      {/* Insert */}
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.insertBlockAfter("codeBlock");
          })
        }
      >
        Code block
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.setBlockType("blockquote");
          })
        }
      >
        Blockquote
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.insertBlockAfter("divider");
          })
        }
      >
        Horizontal rule
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.insertHardBreak();
          })
        }
      >
        Hard break
      </button>

      {/* History */}
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.undo();
          })
        }
      >
        Undo
      </button>
      <button
        {...buttonProps}
        onClick={() =>
          runWithFocus((chain) => {
            chain.redo();
          })
        }
      >
        Redo
      </button>
    </div>
  );
}
