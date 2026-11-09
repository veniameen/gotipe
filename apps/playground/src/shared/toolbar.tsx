import type { GoTipeEditor } from "@gotipe/core";
import { useEditorState } from "@gotipe/react";
import { ThemeToggle } from "@gotipe/block-editor";
import type React from "react";

interface StaticToolbarProps {
  editor: GoTipeEditor | null;
  showHistory?: boolean;
  showHeadings?: boolean;
  showLists?: boolean;
  showIndent?: boolean;
  showMarks?: boolean;
  showExtras?: boolean;
  showLink?: boolean;
  showInsert?: boolean;
  showTheme?: boolean;
}

interface ToolbarState {
  activeMarks: string[];
  activeBlockType: string;
  activeBlockAttrs: Record<string, unknown>;
  canUndo: boolean;
  canRedo: boolean;
}

type CommandChain = ReturnType<GoTipeEditor["chain"]>;

export function StaticToolbar({
  editor,
  showHistory = true,
  showHeadings = true,
  showLists = true,
  showIndent = true,
  showMarks = true,
  showExtras = false,
  showLink = true,
  showInsert = true,
  showTheme = false,
}: StaticToolbarProps) {
  const toolbar = useEditorState<ToolbarState | null>(editor, (state) => state.toolbar ?? null);

  if (!editor) return null;

  const marks = toolbar?.activeMarks ?? [];
  const blockType = toolbar?.activeBlockType ?? "paragraph";
  const blockAttrs = toolbar?.activeBlockAttrs ?? {};

  const isMarkActive = (mark: string) => marks.includes(mark);

  const headingLevel = blockType === "heading" ? (blockAttrs.level as number) : 0;
  const preventFocusSteal = (e: React.MouseEvent<HTMLElement>) => {
    // Keep DOM selection visible and typing flow uninterrupted after toolbar clicks.
    e.preventDefault();
  };
  const runWithFocus = (apply: (chain: CommandChain) => void) => {
    const chain = editor.chain().focus();
    apply(chain);
    chain.run();
  };

  return (
    <div className="gotipe-static-toolbar">
      {/* History */}
      {showHistory && (
        <div className="gotipe-toolbar-group">
          <button
            className="gotipe-toolbar-btn"
            title="Undo"
            disabled={!toolbar?.canUndo}
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.undo();
              })
            }
          >
            {"↶"}
          </button>
          <button
            className="gotipe-toolbar-btn"
            title="Redo"
            disabled={!toolbar?.canRedo}
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.redo();
              })
            }
          >
            {"↷"}
          </button>
        </div>
      )}

      <span className="gotipe-toolbar-separator" />

      {/* Block type dropdown */}
      {showHeadings && (
        <div className="gotipe-toolbar-group">
          <select
            className="gotipe-toolbar-dropdown gotipe-select gotipe-select--compact"
            value={headingLevel > 0 ? `h${headingLevel}` : "paragraph"}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "paragraph") {
                runWithFocus((chain) => {
                  chain.setBlockType("paragraph");
                });
              } else {
                const level = parseInt(val.replace("h", ""), 10);
                runWithFocus((chain) => {
                  chain.setBlockType("heading", { level });
                });
              }
            }}
          >
            <option value="paragraph">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
          </select>
        </div>
      )}

      <span className="gotipe-toolbar-separator" />

      {/* Lists */}
      {showLists && (
        <div className="gotipe-toolbar-group">
          <button
            className={`gotipe-toolbar-btn ${blockType === "bulletList" ? "active" : ""}`}
            title="Bullet List"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleBulletList();
              })
            }
          >
            {"•"}
          </button>
          <button
            className={`gotipe-toolbar-btn ${blockType === "orderedList" ? "active" : ""}`}
            title="Ordered List"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleOrderedList();
              })
            }
          >
            {"1."}
          </button>
          <button
            className={`gotipe-toolbar-btn ${blockType === "todoList" ? "active" : ""}`}
            title="Task List"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleTodoList();
              })
            }
          >
            {"☑"}
          </button>
        </div>
      )}

      {/* Indent */}
      {showIndent && (
        <div className="gotipe-toolbar-group">
          <button
            className="gotipe-toolbar-btn"
            title="Indent"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.indent();
              })
            }
          >
            {"⇥"}
          </button>
          <button
            className="gotipe-toolbar-btn"
            title="Outdent"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.outdent();
              })
            }
          >
            {"⇤"}
          </button>
        </div>
      )}

      <span className="gotipe-toolbar-separator" />

      {/* Formatting marks */}
      {showMarks && (
        <div className="gotipe-toolbar-group">
          <button
            className={`gotipe-toolbar-btn ${isMarkActive("bold") ? "active" : ""}`}
            title="Bold (Cmd+B)"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleBold();
              })
            }
          >
            <strong>B</strong>
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive("italic") ? "active" : ""}`}
            title="Italic (Cmd+I)"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleItalic();
              })
            }
          >
            <em>I</em>
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive("strikethrough") ? "active" : ""}`}
            title="Strikethrough"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleStrikethrough();
              })
            }
          >
            <s>S</s>
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive("code") ? "active" : ""}`}
            title="Inline Code"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleCode();
              })
            }
          >
            {"</>"}
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive("underline") ? "active" : ""}`}
            title="Underline (Cmd+U)"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleUnderline();
              })
            }
          >
            <u>U</u>
          </button>
        </div>
      )}

      {/* Extras */}
      {showExtras && (
        <div className="gotipe-toolbar-group">
          <button
            className={`gotipe-toolbar-btn ${isMarkActive("superscript") ? "active" : ""}`}
            title="Superscript"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleSuperscript();
              })
            }
          >
            {"X²"}
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive("subscript") ? "active" : ""}`}
            title="Subscript"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() =>
              runWithFocus((chain) => {
                chain.toggleSubscript();
              })
            }
          >
            {"X₂"}
          </button>
        </div>
      )}

      {/* Link */}
      {showLink && (
        <div className="gotipe-toolbar-group">
          <button
            className={`gotipe-toolbar-btn ${isMarkActive("link") ? "active" : ""}`}
            title="Insert Link"
            onPointerDown={preventFocusSteal}
            onMouseDown={preventFocusSteal}
            onClick={() => {
              if (isMarkActive("link")) {
                runWithFocus((chain) => {
                  chain.removeMark("link");
                });
              } else {
                const href = prompt("Enter URL:");
                if (href) {
                  runWithFocus((chain) => {
                    chain.setLink(href);
                  });
                }
              }
            }}
          >
            {"🔗"}
          </button>
        </div>
      )}

      <span className="gotipe-toolbar-separator" />

      {/* Insert */}
      {showInsert && (
        <div className="gotipe-toolbar-group">
          <select
            className="gotipe-toolbar-dropdown gotipe-select gotipe-select--compact"
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              switch (val) {
                case "table":
                  runWithFocus((chain) => {
                    chain.insertTable({ rows: 3, cols: 3, withHeader: true });
                  });
                  break;
                case "codeBlock":
                  runWithFocus((chain) => {
                    chain.insertBlockAfter("codeBlock");
                  });
                  break;
                case "divider":
                  runWithFocus((chain) => {
                    chain.insertBlockAfter("divider");
                  });
                  break;
                case "callout":
                  runWithFocus((chain) => {
                    chain.insertBlockAfter("callout");
                  });
                  break;
                case "blockquote":
                  runWithFocus((chain) => {
                    chain.setBlockType("blockquote");
                  });
                  break;
              }
            }}
          >
            <option value="">+ Insert</option>
            <option value="table">Table</option>
            <option value="codeBlock">Code Block</option>
            <option value="blockquote">Blockquote</option>
            <option value="divider">Divider</option>
            <option value="callout">Callout</option>
          </select>
        </div>
      )}

      {/* Theme toggle */}
      {showTheme && (
        <div className="gotipe-toolbar-group" style={{ marginLeft: "auto" }}>
          <ThemeToggle />
        </div>
      )}
    </div>
  );
}
