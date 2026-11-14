import { findBlockInTree, getMarksAt } from "../document/tree";
import { fromWasmDoc } from "../engine/conversion";
import type { Block } from "../types/block";
import type { Decoration, MarkView, SelectionView, ViewState } from "../types/view";

interface ViewStatePort {
  getDocumentJSON(): string;
  getSelection(): SelectionView;
  /** Marks declared `atomic` carry `atomic: true` in the view (MarkView). */
  isAtomic?(markType: string): boolean;
  getStoredMarks(): MarkView[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
}

/** Owns document identity sharing, presentation layers and the stable view snapshot. */
export function createViewState(port: ViewStatePort) {
  let cachedViewState: ViewState | null = null;
  const decorationLayers = new Map<string, Decoration[]>();
  const EMPTY_DECORATIONS: Decoration[] = [];
  // Parsed-state cache: the JSON of the engine state is parsed once per change,
  // and unchanged top-level blocks keep their object identity (cheap re-renders).
  let lastStateJson: string | null = null;
  let lastParsed: { blocks: ViewState["blocks"]; version: number } | null = null;
  const blockKeys = new WeakMap<object, string>();

  const withEmptyDecorations = (
    block: ViewState["blocks"][number],
  ): ViewState["blocks"][number] => {
    block.decorations = EMPTY_DECORATIONS;
    for (const child of block.children) withEmptyDecorations(child);
    return block;
  };

  const shareBlocks = (
    prev: ViewState["blocks"],
    next: ViewState["blocks"],
  ): ViewState["blocks"] => {
    const prevById = new Map<string, ViewState["blocks"][number]>();
    for (const block of prev) prevById.set(block.id, block);
    return next.map((block) => {
      const key = JSON.stringify(block);
      const old = prevById.get(block.id);
      if (old && blockKeys.get(old) === key) return old;
      withEmptyDecorations(block);
      blockKeys.set(block, key);
      return block;
    });
  };

  // Blocks whose DOM must be rebuilt from the model (see correctDomFromWasmState).
  const renderEpochs = new Map<string, number>();

  const allDecorations = (): Decoration[] => {
    if (decorationLayers.size === 0) return EMPTY_DECORATIONS;
    const out: Decoration[] = [];
    for (const layer of decorationLayers.values()) out.push(...layer);
    return out;
  };

  const decorationBlockId = (d: Decoration): string | null =>
    "blockId" in d && typeof d.blockId === "string" ? d.blockId : null;

  const attachDecorations = (blocks: ViewState["blocks"]): ViewState["blocks"] => {
    const all = allDecorations();
    if (all.length === 0 && renderEpochs.size === 0) return blocks;
    const byBlock = new Map<string, Decoration[]>();
    for (const d of all) {
      const id = decorationBlockId(d);
      if (!id) continue;
      const list = byBlock.get(id);
      if (list) list.push(d);
      else byBlock.set(id, [d]);
    }
    if (byBlock.size === 0 && renderEpochs.size === 0) return blocks;
    const visit = (block: ViewState["blocks"][number]): ViewState["blocks"][number] => {
      const own = byBlock.get(block.id);
      const epoch = renderEpochs.get(block.id);
      let children = block.children;
      let childChanged = false;
      if (children.length > 0) {
        const mapped = children.map(visit);
        childChanged = mapped.some((c, i) => c !== children[i]);
        if (childChanged) children = mapped;
      }
      if (!own && !childChanged && epoch === undefined) return block;
      const next = { ...block, children, decorations: own ?? EMPTY_DECORATIONS };
      if (epoch !== undefined) next.renderKey = epoch;
      return next;
    };
    return blocks.map(visit);
  };

  const get = (): ViewState => {
    if (cachedViewState) return cachedViewState;
    const currentSelection = port.getSelection();
    const storedMarks = port.getStoredMarks();

    const defaultSelection = {
      type: "text" as const,
      anchor: { blockId: "", offset: 0 },
      head: { blockId: "", offset: 0 },
    };
    const json = port.getDocumentJSON();
    if (json !== lastStateJson || !lastParsed) {
      const document = fromWasmDoc(JSON.parse(json));
      const atomic = port.isAtomic;
      const content = (block: Block): Block["content"] =>
        atomic && Array.isArray(block.content)
          ? block.content.map((span) =>
              span.marks.some((mark) => atomic(mark.type))
                ? {
                    ...span,
                    marks: span.marks.map((mark) =>
                      atomic(mark.type) ? { ...mark, atomic: true as const } : mark,
                    ),
                  }
                : span,
            )
          : block.content;
      const toView = (block: Block): ViewState["blocks"][number] => ({
        ...block,
        content: content(block) as ViewState["blocks"][number]["content"],
        children: block.children.map(toView),
        decorations: EMPTY_DECORATIONS,
      });
      lastParsed = {
        version: document.version,
        blocks: shareBlocks(lastParsed?.blocks ?? [], document.blocks.map(toView)),
      };
      lastStateJson = json;
    }
    const parsed = lastParsed;
    const blocks = attachDecorations(parsed.blocks);
    const sel = currentSelection.anchor.blockId ? currentSelection : defaultSelection;

    // Compute toolbar state from JS side (WASM doesn't track toolbar)
    const activeBlockId = sel.anchor.blockId;
    const currentBlock = activeBlockId ? findBlockInTree(blocks, activeBlockId) : null;
    const isCollapsed =
      sel.anchor.blockId === sel.head.blockId && sel.anchor.offset === sel.head.offset;

    let active: { type: string; attrs?: Record<string, unknown> }[];
    if (storedMarks !== null) {
      active = storedMarks;
    } else if (activeBlockId) {
      active = isCollapsed
        ? getMarksAt(blocks, activeBlockId, sel.anchor.offset)
        : getMarksAt(blocks, activeBlockId, Math.min(sel.anchor.offset, sel.head.offset), false);
    } else {
      active = [];
    }
    const activeMarks = active.map((m) => m.type);
    const activeMarkAttrs = Object.fromEntries(active.map((m) => [m.type, m.attrs ?? {}]));

    const toolbar: ViewState["toolbar"] = {
      activeMarks,
      activeMarkAttrs,
      activeBlockType: currentBlock?.type ?? "paragraph",
      activeBlockAttrs: (currentBlock?.attrs ?? {}) as Record<string, unknown>,
      canUndo: port.canUndo(),
      canRedo: port.canRedo(),
    };

    cachedViewState = {
      blocks,
      selection: sel,
      decorations: allDecorations(),
      toolbar,
      version: (parsed?.version as number) ?? 1,
    };
    return cachedViewState;
  };
  return {
    get,
    invalidate() {
      cachedViewState = null;
    },
    redraw(ids: string[]) {
      for (const id of ids) renderEpochs.set(id, (renderEpochs.get(id) ?? 0) + 1);
      cachedViewState = null;
    },
    setLayer(layer: string, decorations: Decoration[]): boolean {
      if (!decorations.length) {
        if (!decorationLayers.delete(layer)) return false;
      } else decorationLayers.set(layer, decorations.slice());
      cachedViewState = null;
      return true;
    },
    decorations(layer?: string): Decoration[] {
      return layer === undefined
        ? allDecorations().slice()
        : (decorationLayers.get(layer) ?? EMPTY_DECORATIONS).slice();
    },
  };
}
