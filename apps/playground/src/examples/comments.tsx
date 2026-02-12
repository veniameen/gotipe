import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor, EditorContent } from '@gotipe/react';
import { defineComments } from '@gotipe/comments';

export function CommentsExample() {
  const editor = useEditor({
    extensions: [
      DefaultPreset,
      defineComments({
        currentUser: { id: 'user-1', name: 'Alice' },
      }),
    ],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          attrs: {},
          content: [
            {
              text: 'Select text and click "Add Comment" to create inline comments. ',
              marks: [],
            },
            {
              text: 'Comments support threads, reactions, and resolution.',
              marks: [],
            },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="comments">
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
