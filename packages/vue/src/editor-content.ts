import {
  type BlockView,
  type GoTipeEditor,
  GoTipeError,
  type MarkView,
  type ViewState,
  toSafeColor,
  toSafeHref,
} from "@gotipe/core";
import {
  type PropType,
  type ShallowRef,
  type VNodeChild,
  defineComponent,
  h,
  shallowRef,
  unref,
  watch,
} from "vue";

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

function markedText(text: string, marks: MarkView[]): VNodeChild {
  let node: VNodeChild = text;
  const tags: Record<string, string> = {
    bold: "strong",
    italic: "em",
    underline: "u",
    strikethrough: "s",
    code: "code",
    superscript: "sup",
    subscript: "sub",
    mdRaw: "span",
  };
  for (const mark of marks) {
    const tag = tags[mark.type];
    if (tag) node = h(tag, mark.type === "code" ? { spellcheck: false } : {}, [node]);
    else if (mark.type === "link") {
      const href = toSafeHref(String(mark.attrs?.href ?? ""));
      node = h(
        "a",
        { href: href ?? undefined, title: mark.attrs?.title, rel: "noopener noreferrer" },
        [node],
      );
    } else if (mark.type === "highlight") {
      node = h(
        "mark",
        { style: { backgroundColor: toSafeColor(mark.attrs?.color) ?? undefined } },
        [node],
      );
    } else if (mark.type === "textColor") {
      node = h("span", { style: { color: toSafeColor(mark.attrs?.color) ?? undefined } }, [node]);
    }
  }
  return node;
}

function textContent(block: BlockView): VNodeChild[] {
  if (typeof block.content === "string") return [block.content];
  if (!Array.isArray(block.content) || block.content.every((span) => !span.text)) {
    return [h("br", { "data-gotipe-trailing-break": "" })];
  }
  return block.content.map((span) => markedText(span.text, span.marks));
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

function renderBlock(
  block: BlockView,
  editor: GoTipeEditor,
  views: VueBlockViews,
  parentType?: string,
): VNodeChild {
  const rootProps: Record<string, unknown> = {
    key: block.renderKey === undefined ? block.id : `${block.id}:${block.renderKey}`,
    "data-block-id": block.id,
    "data-block-type": block.type,
  };
  const content = textContent(block);
  const children = block.children.map((child) => renderBlock(child, editor, views, block.type));
  if (views[block.type])
    return views[block.type]!({
      block,
      editor,
      content,
      children,
      rootProps,
      readOnly: !editor.isEditable,
    });
  const node = (tag: string, props = {}, value: VNodeChild[] = [...content, ...children]) =>
    h(tag, { ...rootProps, ...props }, value);
  switch (block.type) {
    case "heading":
      return node(`h${Math.max(1, Math.min(6, Number(block.attrs.level) || 1))}`);
    case "bulletList":
      return node("ul", {}, children);
    case "orderedList":
      return node("ol", { start: Number(block.attrs.start) || 1 }, children);
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
    case "table":
      return node("table", { class: "gotipe-table" }, [h("tbody", {}, children)]);
    case "tableRow":
      return node("tr", {}, children);
    case "tableCell":
    case "tableHeader":
      return node(block.type === "tableHeader" ? "th" : "td", {
        colspan: Number(block.attrs.colspan) || 1,
        rowspan: Number(block.attrs.rowspan) || 1,
        style: { textAlign: block.attrs.align },
      });
    case "callout":
      return node("div", { class: "gotipe-callout" }, [
        h(
          "span",
          { class: "gotipe-callout-icon", contenteditable: false },
          String(block.attrs.icon ?? "💡"),
        ),
        h("div", { class: "gotipe-callout-content" }, [...content, ...children]),
      ]);
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
      return node("pre", { class: "gotipe-math" }, [
        String(block.attrs.latex ?? block.content ?? ""),
      ]);
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

/** Reactive document renderer; owns mounting but never destroys a supplied editor. */
export const EditorContent = defineComponent({
  name: "GoTipeEditorContent",
  props: {
    editor: { type: Object as PropType<VueEditorSource>, default: null },
    blockViews: { type: Object as PropType<VueBlockViews>, default: () => ({}) },
    ariaLabel: { type: String, default: "Document content" },
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
    watch(
      [current, element],
      ([editor, content], _previous, onCleanup) => {
        if (!editor || !content) return;
        editor.mount(content);
        onCleanup(() => editor.unmount());
      },
      { flush: "post" },
    );
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
          ? state.value.blocks.map((block) => renderBlock(block, current()!, props.blockViews))
          : [],
      );
  },
});
