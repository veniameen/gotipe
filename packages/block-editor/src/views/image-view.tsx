import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { ImageBlock } from "@gotipe/react/media";

/** The standalone view and EditorContent share the same host-aware image implementation. */
export function ImageView({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  return <ImageBlock block={block} editor={editor} rootProps={{ "data-block-id": block.id }} />;
}
