import type { GoTipeEditor } from "@gotipe/core";
import { type PropType, defineComponent, h, ref } from "vue";

export const BlockToolbarVue = defineComponent({
  name: "BlockToolbarVue",
  props: {
    editor: { type: Object as PropType<GoTipeEditor>, required: true },
  },
  setup(props) {
    const menuOpen = ref(false);

    return () =>
      h("div", { class: "gotipe-block-toolbar", role: "toolbar", "aria-label": "Block actions" }, [
        h("button", { "aria-label": "Drag to move, click to open menu", draggable: true }, "⠿"),
        h(
          "button",
          {
            "aria-label": "Click to add below. Option-click to add a block above",
            onClick: () => props.editor.chain().insertBlockAfter("paragraph").run(),
          },
          "+",
        ),
        h(
          "button",
          {
            "aria-label": "More actions",
            onClick: () => {
              menuOpen.value = !menuOpen.value;
            },
          },
          "⋯",
        ),
        menuOpen.value &&
          h("div", { class: "gotipe-block-more-menu", role: "menu" }, [
            h(
              "button",
              {
                role: "menuitem",
                onClick: () => {
                  props.editor.chain().duplicateBlock().run();
                  menuOpen.value = false;
                },
              },
              "Duplicate",
            ),
            h(
              "button",
              {
                role: "menuitem",
                onClick: () => {
                  props.editor.chain().deleteBlock().run();
                  menuOpen.value = false;
                },
              },
              "Delete",
            ),
          ]),
      ]);
  },
});
