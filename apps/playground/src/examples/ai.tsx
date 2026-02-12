import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor, EditorContent } from '@gotipe/react';
import { defineAi } from '@gotipe/ai';

export function AIExample() {
  const editor = useEditor({
    extensions: [
      DefaultPreset,
      defineAi({
        apiUrl: '/api/v1/ai',
        token: 'demo-token',
        provider: 'openai',
        model: 'gpt-4o-mini',
        ghostText: { enabled: true, debounceMs: 500 },
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
              text: 'Start typing to see AI ghost text suggestions. Press Tab to accept, Escape to dismiss.',
              marks: [],
            },
          ],
          children: [],
        },
        {
          id: 'b2',
          type: 'paragraph',
          attrs: {},
          content: [
            {
              text: 'Use Cmd+J (or Ctrl+J) to open the AI command palette for rewriting, summarizing, or expanding text.',
              marks: [],
            },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="ai">
      <EditorContent editor={editor} />
    </div>
  );
}
