import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { useState } from "react";

export function ImageView({ block, editor: _editor }: { block: BlockView; editor: GoTipeEditor }) {
  const [_resizing, _setResizing] = useState(false);
  const src = block.attrs.src as string;
  const alt = block.attrs.alt as string;
  const width = block.attrs.width as number | undefined;

  return (
    <figure data-block-id={block.id} data-block-type="image" className="gotipe-image-block">
      {src ? (
        <img src={src} alt={alt || ""} style={{ width: width ? `${width}px` : "100%" }} />
      ) : (
        <button type="button" className="gotipe-image-placeholder" aria-label="Upload image">
          Click to upload image
        </button>
      )}
      {block.attrs.caption !== undefined && (
        <figcaption contentEditable suppressContentEditableWarning data-caption="">
          {(block.attrs.caption as string) || "Add caption..."}
        </figcaption>
      )}
    </figure>
  );
}
