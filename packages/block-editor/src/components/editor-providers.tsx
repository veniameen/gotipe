import { MediaBlocksContext } from "@gotipe/react";
import { mediaBlocks } from "@gotipe/react/media";
import type React from "react";
import { AtomProvider, type AtomUIProps } from "../atoms/atom-ui";
import { BlockEditorStrings } from "../i18n/provider";

/**
 * What `BlockEditor` gives the editor below it: the block editor's strings under the host's
 * `I18n`, the editing image and file blocks of `@gotipe/react/media`, and the atoms' host.
 */
export function EditorProviders({
  mentions,
  emoji,
  children,
}: Omit<AtomUIProps, "editor"> & { children: React.ReactNode }) {
  return (
    <BlockEditorStrings>
      <MediaBlocksContext.Provider value={mediaBlocks}>
        <AtomProvider mentions={mentions} emoji={emoji}>
          {children}
        </AtomProvider>
      </MediaBlocksContext.Provider>
    </BlockEditorStrings>
  );
}
