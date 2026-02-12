import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor, EditorContent } from '@gotipe/react';

export function BasicExample() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'heading',
          attrs: { level: 1 },
          content: [{ text: 'Welcome to GoTipe', marks: [] }],
          children: [],
        },
        {
          id: 'b2',
          type: 'paragraph',
          attrs: {},
          content: [
            { text: 'This is a ', marks: [] },
            { text: 'block-first', marks: [{ type: 'bold' }] },
            { text: ' rich text editor powered by Rust/WASM.', marks: [] },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="basic">
      <EditorContent editor={editor} />
    </div>
  );
}
