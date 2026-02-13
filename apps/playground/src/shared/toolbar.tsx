import type { GoTipeEditor } from '@gotipe/core';
import { useEditorState } from '@gotipe/react';
import { ThemeToggle } from '@gotipe/block-editor';

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
  const toolbar = useEditorState<ToolbarState | null>(
    editor,
    (state) => state.toolbar ?? null,
  );

  if (!editor) return null;

  const marks = toolbar?.activeMarks ?? [];
  const blockType = toolbar?.activeBlockType ?? 'paragraph';
  const blockAttrs = toolbar?.activeBlockAttrs ?? {};

  const isMarkActive = (mark: string) => marks.includes(mark);

  const headingLevel = blockType === 'heading' ? (blockAttrs.level as number) : 0;

  return (
    <div className="gotipe-static-toolbar">
      {/* History */}
      {showHistory && (
        <div className="gotipe-toolbar-group">
          <button
            className="gotipe-toolbar-btn"
            title="Undo"
            disabled={!toolbar?.canUndo}
            onClick={() => editor.chain().undo().run()}
          >
            {'↶'}
          </button>
          <button
            className="gotipe-toolbar-btn"
            title="Redo"
            disabled={!toolbar?.canRedo}
            onClick={() => editor.chain().redo().run()}
          >
            {'↷'}
          </button>
        </div>
      )}

      <span className="gotipe-toolbar-separator" />

      {/* Block type dropdown */}
      {showHeadings && (
        <div className="gotipe-toolbar-group">
          <select
            className="gotipe-toolbar-dropdown"
            value={headingLevel > 0 ? `h${headingLevel}` : 'paragraph'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'paragraph') {
                editor.chain().setBlockType('paragraph').run();
              } else {
                const level = parseInt(val.replace('h', ''), 10);
                editor.chain().setBlockType('heading', { level }).run();
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
            className={`gotipe-toolbar-btn ${blockType === 'bulletList' ? 'active' : ''}`}
            title="Bullet List"
            onClick={() => editor.chain().toggleBulletList().run()}
          >
            {'•'}
          </button>
          <button
            className={`gotipe-toolbar-btn ${blockType === 'orderedList' ? 'active' : ''}`}
            title="Ordered List"
            onClick={() => editor.chain().toggleOrderedList().run()}
          >
            {'1.'}
          </button>
          <button
            className={`gotipe-toolbar-btn ${blockType === 'todoList' ? 'active' : ''}`}
            title="Task List"
            onClick={() => editor.chain().toggleTodoList().run()}
          >
            {'☑'}
          </button>
        </div>
      )}

      {/* Indent */}
      {showIndent && (
        <div className="gotipe-toolbar-group">
          <button
            className="gotipe-toolbar-btn"
            title="Indent"
            onClick={() => editor.chain().indent().run()}
          >
            {'⇥'}
          </button>
          <button
            className="gotipe-toolbar-btn"
            title="Outdent"
            onClick={() => editor.chain().outdent().run()}
          >
            {'⇤'}
          </button>
        </div>
      )}

      <span className="gotipe-toolbar-separator" />

      {/* Formatting marks */}
      {showMarks && (
        <div className="gotipe-toolbar-group">
          <button
            className={`gotipe-toolbar-btn ${isMarkActive('bold') ? 'active' : ''}`}
            title="Bold (Cmd+B)"
            onClick={() => editor.chain().toggleBold().run()}
          >
            <strong>B</strong>
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive('italic') ? 'active' : ''}`}
            title="Italic (Cmd+I)"
            onClick={() => editor.chain().toggleItalic().run()}
          >
            <em>I</em>
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive('strikethrough') ? 'active' : ''}`}
            title="Strikethrough"
            onClick={() => editor.chain().toggleStrikethrough().run()}
          >
            <s>S</s>
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive('code') ? 'active' : ''}`}
            title="Inline Code"
            onClick={() => editor.chain().toggleCode().run()}
          >
            {'</>'}
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive('underline') ? 'active' : ''}`}
            title="Underline (Cmd+U)"
            onClick={() => editor.chain().toggleUnderline().run()}
          >
            <u>U</u>
          </button>
        </div>
      )}

      {/* Extras */}
      {showExtras && (
        <div className="gotipe-toolbar-group">
          <button
            className={`gotipe-toolbar-btn ${isMarkActive('superscript') ? 'active' : ''}`}
            title="Superscript"
            onClick={() => editor.chain().toggleSuperscript().run()}
          >
            {'X²'}
          </button>
          <button
            className={`gotipe-toolbar-btn ${isMarkActive('subscript') ? 'active' : ''}`}
            title="Subscript"
            onClick={() => editor.chain().toggleSubscript().run()}
          >
            {'X₂'}
          </button>
        </div>
      )}

      {/* Link */}
      {showLink && (
        <div className="gotipe-toolbar-group">
          <button
            className={`gotipe-toolbar-btn ${isMarkActive('link') ? 'active' : ''}`}
            title="Insert Link"
            onClick={() => {
              if (isMarkActive('link')) {
                editor.chain().removeMark('link').run();
              } else {
                const href = prompt('Enter URL:');
                if (href) {
                  editor.chain().setLink(href).run();
                }
              }
            }}
          >
            {'🔗'}
          </button>
        </div>
      )}

      <span className="gotipe-toolbar-separator" />

      {/* Insert */}
      {showInsert && (
        <div className="gotipe-toolbar-group">
          <select
            className="gotipe-toolbar-dropdown"
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (!val) return;
              switch (val) {
                case 'table':
                  editor.chain().insertTable({ rows: 3, cols: 3, withHeader: true }).run();
                  break;
                case 'codeBlock':
                  editor.chain().insertBlockAfter('codeBlock').run();
                  break;
                case 'divider':
                  editor.chain().insertBlockAfter('divider').run();
                  break;
                case 'callout':
                  editor.chain().insertBlockAfter('callout').run();
                  break;
                case 'blockquote':
                  editor.chain().setBlockType('blockquote').run();
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
        <div className="gotipe-toolbar-group" style={{ marginLeft: 'auto' }}>
          <ThemeToggle />
        </div>
      )}
    </div>
  );
}
