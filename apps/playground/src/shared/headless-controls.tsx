import type { GoTipeEditor } from '@gotipe/core';

interface HeadlessControlsProps {
  editor: GoTipeEditor | null;
}

/**
 * Intentionally unstyled HTML buttons for the Headless Editor template.
 * No CSS classes, no icons — just text labels. BYO styles.
 */
export function HeadlessControls({ editor }: HeadlessControlsProps) {
  if (!editor) return null;

  return (
    <div className="gotipe-headless-controls">
      {/* Marks */}
      <button onClick={() => editor.chain().toggleBold().run()}>Bold</button>
      <button onClick={() => editor.chain().toggleItalic().run()}>Italic</button>
      <button onClick={() => editor.chain().toggleStrikethrough().run()}>Strike</button>
      <button onClick={() => editor.chain().toggleCode().run()}>Code</button>
      <button onClick={() => editor.chain().toggleUnderline().run()}>Underline</button>
      <button onClick={() => editor.chain().clearFormatting().run()}>Clear marks</button>

      {/* Block types */}
      <button onClick={() => editor.chain().setBlockType('paragraph').run()}>Paragraph</button>
      <button onClick={() => editor.chain().setBlockType('heading', { level: 1 }).run()}>H1</button>
      <button onClick={() => editor.chain().setBlockType('heading', { level: 2 }).run()}>H2</button>
      <button onClick={() => editor.chain().setBlockType('heading', { level: 3 }).run()}>H3</button>
      <button onClick={() => editor.chain().setBlockType('heading', { level: 4 }).run()}>H4</button>
      <button onClick={() => editor.chain().setBlockType('heading', { level: 5 }).run()}>H5</button>
      <button onClick={() => editor.chain().setBlockType('heading', { level: 6 }).run()}>H6</button>

      {/* Lists */}
      <button onClick={() => editor.chain().toggleBulletList().run()}>Bullet list</button>
      <button onClick={() => editor.chain().toggleOrderedList().run()}>Ordered list</button>
      <button onClick={() => editor.chain().toggleTodoList().run()}>Task list</button>

      {/* Insert */}
      <button onClick={() => editor.chain().insertBlockAfter('codeBlock').run()}>Code block</button>
      <button onClick={() => editor.chain().setBlockType('blockquote').run()}>Blockquote</button>
      <button onClick={() => editor.chain().insertBlockAfter('divider').run()}>Horizontal rule</button>
      <button onClick={() => editor.chain().insertHardBreak().run()}>Hard break</button>

      {/* History */}
      <button onClick={() => editor.chain().undo().run()}>Undo</button>
      <button onClick={() => editor.chain().redo().run()}>Redo</button>
    </div>
  );
}
