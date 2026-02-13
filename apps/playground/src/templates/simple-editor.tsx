import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor, Editor } from '@gotipe/react';
import { ExampleWrapper } from '../shared/example-wrapper';
import { StaticToolbar } from '../shared/toolbar';
import { SIMPLE_CONTENT } from '../shared/sample-content';

export function SimpleEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    content: SIMPLE_CONTENT,
  });

  return (
    <ExampleWrapper
      title="Simple Editor"
      description="Classic toolbar editor. Open-source (MIT). No AI, no slash menu, no bubble menu — just a clean toolbar."
      tags={['MIT']}
    >
      <div className="gotipe-simple-editor">
        <StaticToolbar editor={editor} showTheme />
        <Editor editor={editor} />
      </div>
    </ExampleWrapper>
  );
}
