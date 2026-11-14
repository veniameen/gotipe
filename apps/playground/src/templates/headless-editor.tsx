import { Heading } from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";
import { Editor, MediaBlocksContext, useEditor } from "@gotipe/react";
import { mediaBlocks } from "@gotipe/react/media";
import { ExampleWrapper } from "../shared/example-wrapper";
import { HeadlessControls } from "../shared/headless-controls";
import { SIMPLE_CONTENT } from "../shared/sample-content";

/** DefaultPreset's heading levels, configured here so the controls offer the same ones. */
const HEADING = Heading.configure({ levels: [1, 2, 3] });

export function HeadlessEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset, HEADING],
    content: SIMPLE_CONTENT,
  });

  return (
    <ExampleWrapper
      title="Headless Editor"
      description="Headless commands with host-provided controls. This demo supplies its own buttons and styles; your application can build a custom interface."
      tags={["MIT"]}
    >
      <HeadlessControls editor={editor} headingLevels={HEADING.options?.levels ?? []} />
      <MediaBlocksContext.Provider value={mediaBlocks}>
        <Editor editor={editor} className="gotipe-headless-editor" />
      </MediaBlocksContext.Provider>
    </ExampleWrapper>
  );
}
