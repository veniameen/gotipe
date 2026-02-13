import { defineExtension } from '@gotipe/core';
import { MinimalPreset } from '@gotipe/core/presets';
import { useEditor } from '@gotipe/react';
import { BlockEditor } from '@gotipe/block-editor';

const CalloutExtension = defineExtension({
  name: 'callout',
  schema: {
    type: 'block',
    attrs: {
      emoji: { default: '💡' },
      variant: { default: 'info' },
    },
    content: 'richText',
  },
  commands: {
    insertCallout:
      (attrs = {}) =>
      ({ commands }) => {
        commands.insertBlock({
          type: 'callout',
          attrs: { emoji: '💡', variant: 'info', ...attrs },
        });
      },
  },
  keybindings: {
    'Mod-Shift-c': 'insertCallout',
  },
});

export function CustomExample() {
  const editor = useEditor({
    extensions: [MinimalPreset, CalloutExtension],
    content: {
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'paragraph',
          attrs: {},
          content: [
            {
              text: 'This editor uses MinimalPreset + a custom Callout extension. Press Cmd+Shift+C to insert a callout.',
              marks: [],
            },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <BlockEditor editor={editor} showThemeToggle={false} showAiCommandBar={false} />
  );
}
