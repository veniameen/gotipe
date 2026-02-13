import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor } from '@gotipe/react';
import { BlockEditor } from '@gotipe/block-editor';
import { defineVersions } from '@gotipe/versions';

export function VersionsExample() {
  const editor = useEditor({
    extensions: [
      DefaultPreset,
      defineVersions.configure({ autoSave: true, autoSaveInterval: 30000 }),
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
          onClick={() => {
            const manager = (editor as unknown as Record<string, unknown>)?.__versionsManager as { createVersion: (name: string, createdBy: string) => unknown } | undefined;
            manager?.createVersion(`Version ${new Date().toLocaleString()}`, 'user');
          }}
        >
          Create Named Version
        </button>
        <button
          data-gotipe-action="show-history"
          onClick={() => {
            const manager = (editor as unknown as Record<string, unknown>)?.__versionsManager as { getVersions: () => unknown[] } | undefined;
            const versions = manager?.getVersions() ?? [];
            console.log('Version history:', versions);
            alert(`${versions.length} version(s) saved`);
          }}
        >
          Show History
        </button>
      </div>
      <BlockEditor editor={editor} showThemeToggle={false} showAiCommandBar={false} />
    </div>
  );
}
