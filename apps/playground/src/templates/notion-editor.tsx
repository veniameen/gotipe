import { FullPreset } from '@gotipe/core/presets';
import { useEditor } from '@gotipe/react';
import { BlockEditor } from '@gotipe/block-editor';
import { ExampleWrapper } from '../shared/example-wrapper';
import { RICH_CONTENT } from '../shared/sample-content';

export function NotionEditor() {
  const editor = useEditor({
    extensions: [FullPreset],
    content: RICH_CONTENT,
  });

  return (
    <ExampleWrapper
      title="Notion-like Editor"
      description="Full-featured block editor with slash commands, bubble menu, drag handles, and dark mode. Commercial license."
      tags={['Commercial']}
    >
      <BlockEditor
        editor={editor}
        showSlashMenu
        showBlockToolbar
        showBubbleMenu
        showAiCommandBar={false}
        showThemeToggle
      />
    </ExampleWrapper>
  );
}
