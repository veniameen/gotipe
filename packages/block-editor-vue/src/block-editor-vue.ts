import { EditorContent, type VueBlockViews, type VueEditorSource, editorKey } from "@gotipe/vue";
import { type PropType, computed, defineComponent, h, provide, unref } from "vue";

export interface BlockEditorVueProps {
  editor: VueEditorSource;
  class?: string;
  blockViews?: VueBlockViews;
  ariaLabel?: string;
}

export const BlockEditorVue = defineComponent({
  name: "BlockEditorVue",
  props: {
    editor: { type: Object as PropType<VueEditorSource>, default: null },
    class: { type: String, default: "" },
    blockViews: { type: Object as PropType<VueBlockViews>, default: () => ({}) },
    ariaLabel: { type: String, default: "Document content" },
  },
  setup(props, { slots }) {
    provide(
      editorKey,
      computed(() => unref(props.editor)),
    );
    return () =>
      h("div", { class: ["gotipe-block-editor", props.class], "data-gotipe-block-editor": "" }, [
        h(EditorContent, {
          editor: props.editor,
          blockViews: props.blockViews,
          ariaLabel: props.ariaLabel,
        }),
        unref(props.editor) ? slots.default?.() : null,
      ]);
  },
});
