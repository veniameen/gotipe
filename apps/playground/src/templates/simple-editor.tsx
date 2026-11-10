import { DefaultPreset } from "@gotipe/core/presets";
import { Editor, useEditor } from "@gotipe/react";
import { ExampleWrapper } from "../shared/example-wrapper";
import { SIMPLE_CONTENT } from "../shared/sample-content";
import { StaticToolbar } from "../shared/toolbar";

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
        <StaticToolbar editor={editor} showTheme />
        <Editor editor={editor} />
      </div>
    </ExampleWrapper>
  );
}
