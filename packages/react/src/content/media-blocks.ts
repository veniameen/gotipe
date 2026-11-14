import type { BlockView, GoTipeEditor } from "@gotipe/core";
import type React from "react";
import { createContext, useContext } from "react";

/** Props of an image or file block drawn by the media entry. */
export interface MediaBlockProps {
  block: BlockView;
  editor: GoTipeEditor;
  rootProps: Record<string, unknown>;
}

/** The editing image and file blocks, such as `mediaBlocks` of `@gotipe/react/media`. */
export interface MediaBlocks {
  image: (props: MediaBlockProps) => React.ReactNode;
  file: (props: MediaBlockProps) => React.ReactNode;
}

/**
 * Turns on image and file editing (upload, link, resize, crop, caption, alt, preview and the
 * actions menu): `<MediaBlocksContext.Provider value={mediaBlocks}>`. Without it, images and
 * files are shown read-only and `@gotipe/react/media` is not loaded. `BlockEditor` and
 * `PageEditor` provide it.
 */
export const MediaBlocksContext = createContext<MediaBlocks | null>(null);

export const useMediaBlocks = (): MediaBlocks | null => useContext(MediaBlocksContext);
