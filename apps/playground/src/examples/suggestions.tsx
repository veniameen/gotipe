import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor, EditorContent } from '@gotipe/react';
import { defineSuggestions } from '@gotipe/suggestions';
import { useState } from 'react';

export function SuggestionsExample() {
  const [mode, setMode] = useState<'editing' | 'suggesting'>('editing');

  const editor = useEditor({
    extensions: [
      DefaultPreset,
      defineSuggestions({
        currentUser: { id: 'user-1', name: 'Alice' },
        mode,
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
              text: 'Toggle "Suggesting" mode and make edits. Changes appear as tracked suggestions that can be accepted or rejected.',
              marks: [],
            },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="suggestions">
      <div style={{ marginBottom: '1rem' }}>
        <button
          data-gotipe-mode="editing"
          onClick={() => setMode('editing')}
          className={mode === 'editing' ? 'active' : ''}
        >
          Editing
        </button>
        <button
          data-gotipe-mode="suggesting"
          onClick={() => setMode('suggesting')}
          className={mode === 'suggesting' ? 'active' : ''}
        >
          Suggesting
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
