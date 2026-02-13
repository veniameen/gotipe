import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor } from '@gotipe/react';
import { BlockEditor, CommentSidebar } from '@gotipe/block-editor';
import type { CommentData } from '@gotipe/block-editor';
import { defineComments } from '@gotipe/comments';
import { useState } from 'react';

export function CommentsExample() {
  const [comments, setComments] = useState<CommentData[]>([
    {
      id: 'c1',
      author: 'Alice',
      timestamp: Date.now() - 60000,
      body: 'This paragraph could use more detail about the comments feature.',
      anchorBlockId: 'b1',
      resolved: false,
      replies: [],
    },
  ]);

  const editor = useEditor({
    extensions: [
      DefaultPreset,
      defineComments,
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
    <div data-gotipe-example="comments" style={{ display: 'flex', gap: '1rem' }}>
      <div style={{ flex: 1 }}>
        <BlockEditor editor={editor} showThemeToggle={false} showAiCommandBar={false} />
      </div>
      <div style={{ width: 300 }}>
        {editor && (
          <CommentSidebar
            editor={editor}
            comments={comments}
            currentUser="Alice"
            onAddReply={(commentId, body) => {
              setComments(prev => prev.map(c =>
                c.id === commentId
                  ? { ...c, replies: [...c.replies, { id: crypto.randomUUID(), author: 'Alice', timestamp: Date.now(), body }] }
                  : c
              ));
            }}
            onResolve={(commentId) => {
              setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: true } : c));
            }}
            onUnresolve={(commentId) => {
              setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: false } : c));
            }}
          />
        )}
      </div>
    </div>
  );
}
