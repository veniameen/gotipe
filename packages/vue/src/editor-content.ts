import {
  type BlockView,
  type BlocksDecoration,
  type GoTipeEditor,
  GoTipeError,
  type ViewState,
  cellSpan,
  headerRows,
  tableGrid,
  toSafeHref,
} from "@gotipe/core";
import {
  type PropType,
  type ShallowRef,
  type VNodeChild,
  defineComponent,
  h,
  mergeProps,
  onBeforeUpdate,
  onMounted,
  onUpdated,
  shallowRef,
  unref,
  watch,
} from "vue";
import type { VueMath } from "./atoms";
import { blockPresentation, holdComposing, withoutLayers } from "./decorations";
import { decoratedText } from "./text";

export type VueEditorSource = GoTipeEditor | ShallowRef<GoTipeEditor | null> | null;
export interface VueBlockViewProps {
  block: BlockView;
  editor: GoTipeEditor;
  content: VNodeChild[];
  children: VNodeChild[];
  rootProps: Record<string, unknown>;
  readOnly: boolean;
}
export type VueBlockViews = Record<string, (props: VueBlockViewProps) => VNodeChild>;
/**
 * Words for the block that carries a `placeholder` decoration, `EditorContent`'s `placeholder`
 * prop; they win over the decoration's text, and `null` shows none.
 */
export type VuePlaceholder = (block: BlockView, parentType: string | undefined) => string | null;

interface RenderContext {
  editor: GoTipeEditor;
  views: VueBlockViews;
  placeholder?: VuePlaceholder;
  math?: VueMath;
}

function textContent(block: BlockView, math?: VueMath): VNodeChild[] {
  if (typeof block.content === "string") return [block.content];
  const empty = !Array.isArray(block.content) || block.content.every((span) => !span.text);
  const text = Array.isArray(block.content)
    ? decoratedText(block.content, block.decorations, math)
    : [];
  // Keep empty editable blocks caret-addressable next to their widgets.
  return empty ? [...text, h("br", { "data-gotipe-trailing-break": "" })] : text;
}

function displayAsset(src: string): string | null {
  if (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml)[;,]/i.test(src) || /^blob:/i.test(src))
    return src;
  return toSafeHref(src);
}

const EditorImage = defineComponent({
  props: {
    editor: { type: Object as PropType<GoTipeEditor>, required: true },
    src: { type: String, required: true },
    alt: { type: String, default: "" },
  },
  setup(props) {
    const resolved = shallowRef<string | null>(null);
    watch(
      () => [props.editor, props.src] as const,
      async ([editor, src], _previous, onCleanup) => {
        let cancelled = false;
        onCleanup(() => {
          cancelled = true;
        });
        resolved.value = null;
        try {
          const value = editor.host.resolveAsset ? await editor.host.resolveAsset(src) : src;
          if (!cancelled) resolved.value = value ? displayAsset(value) : null;
        } catch (error) {
          if (!cancelled)
            editor.reportError(new GoTipeError("ASSET_RESOLVE_FAILED", String(error), { src }));
        }
      },
      { immediate: true },
    );
    return () =>
      resolved.value
        ? h("img", { src: resolved.value, alt: props.alt, draggable: false })
        : h("span", { "aria-label": props.alt });
  },
});

/** Suggested blocks of a `blocks` decoration: read-only, outside the document's offsets. */
function phantoms(
  block: BlockView,
  position: "before" | "after",
  context: RenderContext,
  parentType?: string,
): VNodeChild[] {
  return (block.decorations ?? [])
    .filter((d): d is BlocksDecoration => d.type === "blocks" && d.position === position)
    .flatMap((group) =>
      group.blocks.map((phantom) =>
        renderBlock(
          {
            ...phantom,
            decorations: [
              ...(phantom.decorations ?? []),
              {
                type: "node",
                key: group.key,
                blockId: phantom.id,
                className: group.className,
                attrs: group.attrs,
                style: group.style,
              },
            ],
          },
          context,
          parentType,
          true,
        ),
      ),
    );
}

function renderBlocks(
  blocks: BlockView[],
  context: RenderContext,
  parentType?: string,
): VNodeChild[] {
  return blocks.flatMap((block) => [
    ...phantoms(block, "before", context, parentType),
    renderBlock(block, context, parentType),
    ...phantoms(block, "after", context, parentType),
  ]);
}

function renderBlock(
  block: BlockView,
  context: RenderContext,
  parentType?: string,
  phantom = false,
): VNodeChild {
  const { editor, views, placeholder } = context;
  const key = block.renderKey === undefined ? block.id : `${block.id}:${block.renderKey}`;
  const presentation = blockPresentation(
    block,
    editor.isEditable && !phantom,
    placeholder && ((item) => placeholder(item, parentType)),
  );
  const rootProps: Record<string, unknown> = {
    key: phantom ? `phantom:${key}` : key,
    ...(phantom
      ? { "data-gotipe-phantom-id": block.id, "data-gotipe-widget": "", contenteditable: false }
      : { "data-block-id": block.id }),
    "data-block-type": block.type,
    ...presentation.attrs,
    class: presentation.class,
    style: presentation.style,
  };
  const content = textContent(block, context.math);
  const children = renderBlocks(block.children, context, block.type);
  if (views[block.type])
    return views[block.type]!({
      block,
      editor,
      content,
      children,
      rootProps,
      readOnly: !editor.isEditable || phantom,
    });
  const node = (tag: string, props = {}, value: VNodeChild[] = [...content, ...children]) =>
    h(tag, mergeProps(rootProps, props), value);
  switch (block.type) {
    case "heading":
      return node(`h${Math.max(1, Math.min(6, Number(block.attrs.level) || 1))}`);
    case "bulletList":
      return node("ul", {}, children);
    case "orderedList": {
      // its own first number, and the room its widest number needs (D-268, D-269)
      const value = Number(block.attrs.start);
      const start = Number.isInteger(value) ? value : 1;
      const last = start + Math.max(0, block.children.length - 1);
      const digits = Math.max(String(Math.abs(start)).length, String(Math.abs(last)).length);
      return node(
        "ol",
        { start, style: digits > 2 ? { "--gt-list-digits": digits } : undefined },
        children,
      );
    }
    case "todoList":
      return node("ul", { class: "gotipe-todo-list" }, children);
    case "listItem":
      return node("li");
    case "todoItem":
      return node("li", { class: "gotipe-todo-item" }, [
        h("input", {
          type: "checkbox",
          checked: !!block.attrs.checked,
          disabled: !editor.isEditable,
          contenteditable: false,
          "aria-label": "Task completed",
          onMousedown: (event: MouseEvent) => event.preventDefault(),
          onChange: (event: Event) => {
            if (editor.isEditable)
              editor.dispatch({
                steps: [
                  {
                    type: "setBlockAttrs",
                    blockId: block.id,
                    attrs: { checked: (event.target as HTMLInputElement).checked },
                  },
                ],
              });
          },
        }),
        h("span", { "data-gotipe-todo-content": "" }, content),
        ...children,
      ]);
    case "codeBlock":
      return node("pre", { class: "gotipe-code-block", spellcheck: false }, [
        h("code", { "data-language": block.attrs.language ?? "" }, content),
      ]);
    case "blockquote":
      return node("blockquote");
    case "divider":
      return node("hr", { contenteditable: false }, []);
    case "table": {
      // as the React renderer: header rows (and the rows a header reaches into) in the head,
      // one column element per grid column with its stored width
      const grid = tableGrid(block);
      const first = block.children[0]?.children.some((cell) => cell.type === "tableHeader");
      const top = grid.cells.filter((cell) => cell.row === 0).map((cell) => cell.rows);
      const head = Math.max(headerRows(grid), first ? Math.max(1, ...top) : 0);
      const widths = Array.isArray(block.attrs.colWidths) ? block.attrs.colWidths : [];
      const columns = Array.from({ length: grid.columns }, (_, column) => {
        const width = widths[column];
        return h("col", { style: { width: `${typeof width === "number" ? width : 160}px` } });
      });
      const rows = (from: number, to?: number) =>
        renderBlocks(block.children.slice(from, to), context, block.type);
      return node("table", { class: "gotipe-table" }, [
        h("colgroup", {}, columns),
        ...(head > 0 ? [h("thead", {}, rows(0, head))] : []),
        ...(head < block.children.length ? [h("tbody", {}, rows(head))] : []),
      ]);
    }
    case "tableRow":
      return node("tr", {}, children);
    case "tableCell":
    case "tableHeader":
      return node(block.type === "tableHeader" ? "th" : "td", {
        colspan: cellSpan(block.attrs.colspan),
        rowspan: cellSpan(block.attrs.rowspan),
        style: { textAlign: block.attrs.align },
      });
    case "callout": {
      // the callout's own emoji; without one no glyph (React draws the kind's icon)
      const emoji = String(block.attrs.emoji ?? "");
      return node("div", { class: "gotipe-callout" }, [
        ...(emoji
          ? [h("span", { class: "gotipe-callout-icon", contenteditable: false }, emoji)]
          : []),
        h("div", { class: "gotipe-callout-content" }, [...content, ...children]),
      ]);
    }
    case "toggle":
      return node(
        "details",
        {
          open: !!block.attrs.open,
          onToggle: (event: Event) => {
            const open = (event.currentTarget as HTMLDetailsElement).open;
            if (editor.isEditable && open !== !!block.attrs.open)
              editor.dispatch({
                steps: [{ type: "setBlockAttrs", blockId: block.id, attrs: { open } }],
              });
          },
        },
        [h("summary", {}, content), ...children],
      );
    case "columns":
      return node("div", { class: "gotipe-columns" }, children);
    case "column":
      return node("div", { class: "gotipe-column" }, children);
    case "image":
      return node("figure", { class: "gotipe-image", contenteditable: false }, [
        h(EditorImage, {
          editor,
          src: String(block.attrs.src ?? ""),
          alt: String(block.attrs.alt ?? ""),
        }),
        ...(block.attrs.caption ? [h("figcaption", {}, String(block.attrs.caption))] : []),
      ]);
    case "file":
      return node("div", { class: "gotipe-file", contenteditable: false }, [
        h(
          "button",
          {
            type: "button",
            onClick: () => editor.openLink(String(block.attrs.url ?? ""), { blockId: block.id }),
          },
          String(block.attrs.name ?? block.attrs.url ?? "File"),
        ),
      ]);
    case "math":
      // the block's raw text is its TeX
      return node("pre", { class: "gotipe-math" }, content);
    case "embed":
      return node("div", { class: "gotipe-embed", contenteditable: false }, [
        h(
          "button",
          {
            type: "button",
            onClick: () => editor.openLink(String(block.attrs.url ?? ""), { blockId: block.id }),
          },
          String(block.attrs.url ?? ""),
        ),
      ]);
    case "markdownRaw":
      return node("pre", { class: "gotipe-md-raw", contenteditable: false }, content);
    default:
      return node(parentType === "tableRow" ? "td" : "p");
  }
}

/**
 * Reactive document renderer; owns mounting but never destroys a supplied editor.
 * `hostLayers` names the decoration layers the host draws itself (e.g. `collaboration`); they
 * are left out. `placeholder` is a `VuePlaceholder`, `math` a `VueMath`. The props carry no
 * comments of their own: inside the props object they would ship in the JavaScript.
 */
export const EditorContent = defineComponent({
  name: "GoTipeEditorContent",
  props: {
    editor: { type: Object as PropType<VueEditorSource>, default: null },
    blockViews: { type: Object as PropType<VueBlockViews>, default: () => ({}) },
    ariaLabel: { type: String, default: "Document content" },
    hostLayers: { type: Array as PropType<string[]>, default: () => [] },
    placeholder: { type: Function as PropType<VuePlaceholder>, default: undefined },
    math: { type: Object as PropType<VueMath>, default: undefined },
  },
  setup(props) {
    const element = shallowRef<HTMLElement | null>(null);
    const state = shallowRef<ViewState | null>(null);
    const editable = shallowRef(false);
    const current = () => unref(props.editor);
    watch(
      current,
      (editor, _previous, onCleanup) => {
        state.value = editor?.getViewState() ?? null;
        editable.value = editor?.isEditable ?? false;
        if (!editor) return;
        const unsubscribe = editor.on("viewStateChange", (value) => {
          state.value = value;
        });
        const unsubscribeEditable = editor.on("editableChange", (value) => {
          editable.value = value;
        });
        onCleanup(() => {
          unsubscribe();
          unsubscribeEditable();
        });
      },
      { immediate: true },
    );
    // Decorations held while the browser composed are drawn once the composition ends.
    const compositions = shallowRef(0);
    const ended = () => compositions.value++;
    watch(
      [current, element],
      ([editor, content], _previous, onCleanup) => {
        if (!editor || !content) return;
        editor.mount(content);
        content.addEventListener("compositionend", ended);
        onCleanup(() => {
          content.removeEventListener("compositionend", ended);
          editor.unmount();
        });
      },
      { flush: "post" },
    );
    // A presentation-only patch (a decoration layer changed; the document and the selection
    // did not) can move the native caret: the selection read before it is restored after it.
    // Never while the browser composes: the selection is the IME's then.
    let rendered: { editor: GoTipeEditor; state: ViewState } | null = null;
    let kept: ReturnType<GoTipeEditor["getDOMSelection"]> = null;
    const remember = () => {
      const editor = current();
      rendered = editor && state.value ? { editor, state: state.value } : null;
    };
    onMounted(remember);
    onBeforeUpdate(() => {
      kept = null;
      const editor = current();
      const next = state.value;
      if (!editor || !next || !rendered || rendered.editor !== editor || editor.isDestroyed) return;
      if (editor.isComposing) return;
      const before = rendered.state;
      if (before === next || before.version !== next.version) return;
      if (JSON.stringify(before.selection) !== JSON.stringify(next.selection)) return;
      const active = editor.element?.ownerDocument.activeElement;
      if (active && editor.element?.contains(active)) kept = editor.getDOMSelection();
    });
    onUpdated(() => {
      const editor = current();
      const selection = kept;
      kept = null;
      remember();
      if (!editor || !selection || editor.isDestroyed || editor.isComposing) return;
      const now = editor.getDOMSelection();
      if (!now || JSON.stringify(now) !== JSON.stringify(selection)) editor.setSelection(selection);
    });
    /** The blocks drawn last; the composing block keeps their decorations. */
    let drawn: BlockView[] | null = null;
    const blocks = (editor: GoTipeEditor, view: ViewState) => {
      void compositions.value;
      const next = withoutLayers(editor, view.blocks, props.hostLayers);
      const composing = editor.isComposing ? view.selection.anchor.blockId : null;
      drawn = composing ? holdComposing(next, drawn, composing) : next;
      return drawn;
    };
    return () =>
      h(
        "div",
        {
          ref: element,
          class: "gotipe-content",
          role: "textbox",
          "aria-multiline": true,
          "aria-label": props.ariaLabel,
          "aria-readonly": !editable.value,
          "data-gotipe-content": "",
          contenteditable: editable.value,
        },
        current() && state.value
          ? renderBlocks(blocks(current()!, state.value), {
              editor: current()!,
              views: props.blockViews,
              placeholder: props.placeholder,
              math: props.math,
            })
          : [],
      );
  },
});
