import { DefaultPreset } from '@gotipe/core/presets';
import { useEditor, Editor } from '@gotipe/react';
import { ExampleWrapper } from '../shared/example-wrapper';
import { HeadlessControls } from '../shared/headless-controls';
import { SIMPLE_CONTENT } from '../shared/sample-content';

export function HeadlessEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    content: SIMPLE_CONTENT,
  });

  return (
    <ExampleWrapper
      title="Headless Editor"
      description="Zero UI opinions. Raw HTML buttons, bring your own styles. Ideal for building fully custom editor interfaces."
      tags={['MIT']}
    >
      <HeadlessControls editor={editor} />
      <Editor editor={editor} className="gotipe-headless-editor" />
    </ExampleWrapper>
  );
}
