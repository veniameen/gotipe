import type { MediaBlocks } from "../content/media-blocks";
import { FileBlock } from "./file-block";
import { ImageBlock } from "./image-block";

export { FileBlock, ImageBlock };

/**
 * The editing image and file blocks for `MediaBlocksContext` of `@gotipe/react`:
 * upload, link, resize, crop, caption, alt text, preview and the image actions menu.
 */
export const mediaBlocks: MediaBlocks = { image: ImageBlock, file: FileBlock };
