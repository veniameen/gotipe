import { DefaultPreset } from "@gotipe/core/presets";
import { Editor, useEditor } from "@gotipe/react";
import { ExampleWrapper } from "../shared/example-wrapper";
import { HeadlessControls } from "../shared/headless-controls";
import { SIMPLE_CONTENT } from "../shared/sample-content";

export function HeadlessEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    content: SIMPLE_CONTENT,
  });

  return (
    <ExampleWrapper
      title="Headless Editor"
      description="Headless commands with host-provided controls. This demo supplies its own buttons and styles; your application can build a custom interface."
      tags={["MIT"]}
    >
      <HeadlessControls editor={editor} />
      <Editor editor={editor} className="gotipe-headless-editor" />
    </ExampleWrapper>
  );
}
