import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor, EditorContent } from '@gotipe/react';
import { defineVersions } from '@gotipe/versions';

export function VersionsExample() {
  const editor = useEditor({
    extensions: [
      DefaultPreset,
      defineVersions({
        autoSave: { enabled: true, intervalMs: 30000 },
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
              text: 'Edit this document. Versions are auto-saved every 30 seconds. You can also manually create named versions.',
              marks: [],
            },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="versions">
      <div style={{ marginBottom: '1rem' }}>
        <button
          data-gotipe-action="create-version"
          onClick={() => editor?.commands.createVersion({ name: `Version ${Date.now()}` })}
        >
          Create Named Version
        </button>
        <button
          data-gotipe-action="show-history"
          onClick={() => editor?.commands.toggleVersionHistory()}
        >
          Show History
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
