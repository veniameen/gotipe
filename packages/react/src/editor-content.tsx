import type { BlockView, GoTipeEditor } from "@gotipe/core";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
} from "react";
import type { BlockRendererProps } from "./block-renderer";
import { BlockComponent, PhantomBlocks } from "./content/blocks";
import {
  AfterTextContext,
  type AfterTextFn,
  type BlockViews,
  BlockViewsContext,
  LegacyRendererContext,
  PlaceholderContext,
  type PlaceholderFn,
} from "./content/context";
import { holdComposing, withoutLayers } from "./content/decorations";
import { blockKey } from "./content/presentation";
import { SelectionKeeper } from "./content/selection-keeper";
import { useGoTipeI18n } from "./i18n-context";
export { usePhantom } from "./content/context";
export type {
  AfterTextFn,
  BlockViewProps,
  BlockViewComponent,
  BlockViews,
  PlaceholderFn,
} from "./content/context";

/**
 * A host's element in the flow of the document, right after the top-level block that is or holds
 * `blockId` (a field between paragraphs, say): the text below moves down for it. It is a widget,
 * not part of the text: no offsets, no Markdown, the editor does not handle its input or keys.
 */
export interface BlockSlot {
  blockId: string;
  node: React.ReactNode;
}

/** Index of the top-level block that is or holds `id`, or -1. */
function topLevelIndex(blocks: BlockView[], id: string): number {
  const holds = (block: BlockView): boolean => block.id === id || block.children.some(holds);
  return blocks.findIndex(holds);
}

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
  afterText,
  afterBlock,
  hostLayers,
  ariaLabel,
}: {
  editor: GoTipeEditor | null;
  blockRenderer?: (props: BlockRendererProps) => React.ReactNode;
  /** Custom views by block type; everything else uses the built-in views. */
  blockViews?: BlockViews;
  /** Placeholder of empty blocks (shown on the focused empty block and on headings). */
  placeholder?: PlaceholderFn;
  /** What a block with text shows after it, as a widget: a heading's anchor link. */
  afterText?: AfterTextFn;
  /** A host's element in the flow after a block (`BlockSlot`); none when null. */
  afterBlock?: BlockSlot | null;
  /**
   * Decoration layers the host draws itself, e.g. `["collaboration"]` when it has its own
   * cursor overlay. Their decorations are left out; every other layer is drawn.
   */
  hostLayers?: readonly string[];
  /**
   * Accessible name of the document. By default `a11y.editorLabel` of `GoTipeI18nProvider`:
   * "Document content" in English and without a provider.
   */
  ariaLabel?: string;
}) {
  const i18n = useGoTipeI18n();
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

  // Decorations held while the browser composed are drawn once the composition ends.
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !editor) return;
    element.addEventListener("compositionend", redraw);
    return () => element.removeEventListener("compositionend", redraw);
  }, [editor]);

  const layers = hostLayers?.join("\n") ?? "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: the layer names, not the array's identity.
  const blocks = useMemo(
    () => (editor ? withoutLayers(editor, viewState?.blocks ?? [], hostLayers) : []),
    [editor, viewState, layers],
  );
  const selectedBlockId = viewState?.selection.anchor.blockId ?? "";
  // The composing block is where the selection was when the composition started.
  const drawn = useRef<BlockView[] | null>(null);
  const shown = editor?.isComposing
    ? holdComposing(blocks, drawn.current, selectedBlockId)
    : blocks;
  useEffect(() => {
    drawn.current = shown;
  });
  const slotAt = afterBlock ? topLevelIndex(shown, afterBlock.blockId) : -1;

  return (
    <>
      <div
        ref={containerRef}
        role="textbox"
        aria-multiline={true}
        aria-label={ariaLabel ?? i18n.t("a11y.editorLabel")}
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
              <AfterTextContext.Provider value={afterText ?? null}>
                {editor && (
                  <SelectionKeeper editor={editor} state={viewState}>
                    {shown.flatMap((block, index) => {
                      const drawnBlock = (
                        <React.Fragment key={blockKey(block)}>
                          <PhantomBlocks block={block} editor={editor} position="before" />
                          <BlockComponent
                            block={block}
                            editor={editor}
                            selectedBlockId={selectedBlockId}
                          />
                          <PhantomBlocks block={block} editor={editor} position="after" />
                        </React.Fragment>
                      );
                      if (index !== slotAt || !afterBlock) return [drawnBlock];
                      // one key wherever it stands: the host's element keeps its state as it moves
                      return [
                        drawnBlock,
                        <div
                          key="gotipe-block-slot"
                          className="gotipe-block-slot"
                          data-gotipe-widget=""
                          data-gotipe-block-slot={afterBlock.blockId}
                          contentEditable={false}
                          suppressContentEditableWarning
                        >
                          {afterBlock.node}
                        </div>,
                      ];
                    })}
                  </SelectionKeeper>
                )}
              </AfterTextContext.Provider>
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
