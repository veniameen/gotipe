import { FullPreset } from "@gotipe/core/presets";
import { Editor, MediaBlocksContext, useEditor } from "@gotipe/react";
import { mediaBlocks } from "@gotipe/react/media";
import { documentOf } from "../frame/content";
import { DemoScroll } from "../frame/tools";
import { SAMPLE_FILE, SAMPLE_IMAGE } from "./media-samples";
import "../frame/editor-styles";

const DOCUMENT = documentOf("media", (b) => [
  b.block("image", null, {
    src: SAMPLE_IMAGE,
    alt: "Hills under a pale sky",
    caption: "A bundled sample picture",
  }),
  b.block("file", null, SAMPLE_FILE),
]);

/** No `host.saveAsset`: a dropped file stays in the page as a data: URL and goes nowhere. */
export function MediaDemo() {
  const editor = useEditor({ engine: "js", extensions: [FullPreset], content: DOCUMENT });
  return (
    <DemoScroll>
      <MediaBlocksContext.Provider value={mediaBlocks}>
        <Editor editor={editor} className="site-demo-headless" ariaLabel="Media" />
      </MediaBlocksContext.Provider>
    </DemoScroll>
  );
}
