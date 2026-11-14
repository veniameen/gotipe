import { FixedToolbar, ThemeToggle } from "@gotipe/block-editor";
import { DefaultPreset } from "@gotipe/core/presets";
import { Editor, MediaBlocksContext, useEditor } from "@gotipe/react";
import { mediaBlocks } from "@gotipe/react/media";
import { ExampleWrapper } from "../shared/example-wrapper";
import { SIMPLE_CONTENT } from "../shared/sample-content";

export function SimpleEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset],
    content: SIMPLE_CONTENT,
  });

  return (
    <ExampleWrapper
      title="Simple Editor"
      description="Classic toolbar editor. Open-source (MIT). No AI, no slash menu, no bubble menu — just a clean toolbar."
      tags={["MIT"]}
    >
      <div className="gotipe-simple-editor">
        {editor && (
          <FixedToolbar editor={editor}>
            <ThemeToggle />
          </FixedToolbar>
        )}
        <MediaBlocksContext.Provider value={mediaBlocks}>
          <Editor editor={editor} />
        </MediaBlocksContext.Provider>
      </div>
    </ExampleWrapper>
  );
}
