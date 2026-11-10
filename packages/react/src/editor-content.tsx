import type { GoTipeEditor } from "@gotipe/core";
import React, { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { BlockRendererProps } from "./block-renderer";
import { BlockComponent, PhantomBlocks } from "./content/blocks";
import {
  type BlockViews,
  BlockViewsContext,
  LegacyRendererContext,
  PlaceholderContext,
  type PlaceholderFn,
} from "./content/context";
import { blockKey } from "./content/presentation";
export { usePhantom } from "./content/context";
export type {
  BlockViewProps,
  BlockViewComponent,
  BlockViews,
  PlaceholderFn,
} from "./content/context";

function useViewState(editor: GoTipeEditor | null) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor) return () => {};
      return editor.on("viewStateChange", onStoreChange as never);
    },
    [editor],
  );

  const getSnapshot = useCallback(() => {
    if (!editor) return null;
    return editor.getViewState();
  }, [editor]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function EditorContent({
  editor,
  blockRenderer,
  blockViews,
  placeholder,
  ariaLabel = "Document content",
}: {
  editor: GoTipeEditor | null;
  blockRenderer?: (props: BlockRendererProps) => React.ReactNode;
  /** Custom views by block type; everything else uses the built-in views. */
  blockViews?: BlockViews;
  /** Placeholder of empty blocks (shown on the focused empty block and on headings). */
  placeholder?: PlaceholderFn;
  ariaLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewState = useViewState(editor);

  useEffect(() => {
    if (containerRef.current && editor) {
      editor.mount(containerRef.current);
      const blockId = new URL(window.location.href).searchParams.get("gotipe-block");
      const frame = blockId
        ? requestAnimationFrame(() => {
            const target = Array.from(
              containerRef.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? [],
            ).find((element) => element.dataset.blockId === blockId);
            target?.scrollIntoView({ block: "center" });
          })
        : null;
      return () => {
        if (frame !== null) cancelAnimationFrame(frame);
        editor.unmount();
      };
    }
  }, [editor]);

  const blocks = viewState?.blocks ?? [];
  const selectedBlockId = viewState?.selection.anchor.blockId ?? "";

  return (
    <>
      <div
        ref={containerRef}
        role="textbox"
        aria-multiline={true}
        aria-label={ariaLabel}
        aria-readonly={editor ? !editor.isEditable : undefined}
        tabIndex={0}
        className="gotipe-content"
        data-gotipe-content=""
        data-gotipe-readonly={editor && !editor.isEditable ? "" : undefined}
        contentEditable={!!editor && editor.isEditable}
        suppressContentEditableWarning
      >
        <BlockViewsContext.Provider value={blockViews ?? null}>
          <LegacyRendererContext.Provider value={blockRenderer ?? null}>
            <PlaceholderContext.Provider value={placeholder ?? null}>
              {editor &&
                blocks.map((block) => (
                  <React.Fragment key={blockKey(block)}>
                    <PhantomBlocks block={block} editor={editor} position="before" />
                    <BlockComponent
                      block={block}
                      editor={editor}
                      selectedBlockId={selectedBlockId}
                    />
                    <PhantomBlocks block={block} editor={editor} position="after" />
                  </React.Fragment>
                ))}
            </PlaceholderContext.Provider>
          </LegacyRendererContext.Provider>
        </BlockViewsContext.Provider>
      </div>
      {/* Screen reader live region for status updates */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="gotipe-sr-only"
        data-gotipe-live-region=""
      />
    </>
  );
}
