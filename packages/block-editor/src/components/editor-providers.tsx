import { MediaBlocksContext, type MediaOptions, MediaOptionsContext } from "@gotipe/react";
import { mediaBlocks } from "@gotipe/react/media";
import type React from "react";
import { AtomProvider, type AtomUIProps } from "../atoms/atom-ui";
import { BlockEditorStrings } from "../i18n/provider";

/**
 * What `BlockEditor` gives the editor below it: the block editor's strings under the host's
 * `I18n`, the editing image and file blocks of `@gotipe/react/media` with their `media` options,
 * and the atoms' host.
 */
export function EditorProviders({
  mentions,
  emoji,
  media,
  children,
}: Omit<AtomUIProps, "editor"> & { media?: MediaOptions; children: React.ReactNode }) {
  return (
    <BlockEditorStrings>
      <MediaBlocksContext.Provider value={mediaBlocks}>
        <MediaOptionsContext.Provider value={media ?? null}>
          <AtomProvider mentions={mentions} emoji={emoji}>
            {children}
          </AtomProvider>
        </MediaOptionsContext.Provider>
      </MediaBlocksContext.Provider>
    </BlockEditorStrings>
  );
}
