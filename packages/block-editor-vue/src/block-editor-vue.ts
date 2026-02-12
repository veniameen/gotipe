import type { GoTipeEditor } from "@gotipe/core";
import { editorKey } from "@gotipe/vue";
import { type PropType, type ShallowRef, defineComponent, h } from "vue";

export interface BlockEditorVueProps {
  editor: ShallowRef<GoTipeEditor | null>;
  class?: string;
}

export const BlockEditorVue = defineComponent({
  name: "BlockEditorVue",
  props: {
    editor: { type: Object as PropType<ShallowRef<GoTipeEditor | null>>, required: true },
    class: { type: String, default: "" },
  },
  provide() {
    return { [editorKey as unknown as string]: this.editor };
  },
  mounted() {
    const ed = this.editor.value;
    if (ed && this.$refs.content) {
      ed.mount(this.$refs.content as HTMLElement);
    }
  },
  beforeUnmount() {
    this.editor.value?.unmount();
  },
  render() {
    if (!this.editor.value) return null;
    return h(
      "div",
      { class: `gotipe-block-editor ${this.class}`, "data-gotipe-block-editor": "" },
      [
        h("div", {
          ref: "content",
          class: "gotipe-content",
          role: "textbox",
          "aria-multiline": true,
          "aria-label": "Document content",
          "data-gotipe-content": "",
        }),
        this.$slots.default?.(),
      ],
    );
  },
});
