import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor, EditorContent } from '@gotipe/react';
import { defineCollaboration } from '@gotipe/collaboration';
import { useState } from 'react';

export function CollaborationExample() {
  const [documentId] = useState(() => `demo-${Date.now()}`);

  const editor1 = useEditor({
    extensions: [
      DefaultPreset,
      defineCollaboration({
        serverUrl: `ws://${window.location.hostname}:8081`,
        documentId,
        token: 'demo-token',
        user: { name: 'Alice', color: '#FF6B6B' },
      }),
    ],
  });

  const editor2 = useEditor({
    extensions: [
      DefaultPreset,
      defineCollaboration({
        serverUrl: `ws://${window.location.hostname}:8081`,
        documentId,
        token: 'demo-token',
        user: { name: 'Bob', color: '#4ECDC4' },
      }),
    ],
  });

  return (
    <div
      data-gotipe-example="collaboration"
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}
    >
      <div>
        <h3>Alice</h3>
        <EditorContent editor={editor1} />
      </div>
      <div>
        <h3>Bob</h3>
        <EditorContent editor={editor2} />
      </div>
    </div>
  );
}
