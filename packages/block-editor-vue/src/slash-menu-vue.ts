import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import { type PropType, defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";

export const SlashMenuVue = defineComponent({
  name: "SlashMenuVue",
  props: {
    editor: { type: Object as PropType<GoTipeEditor>, required: true },
    commands: { type: Array as PropType<SlashCommandDef[]>, default: () => [] },
  },
  setup(props) {
    const visible = ref(false);
    const selectedIndex = ref(0);

    let unsub: (() => void) | undefined;

    onMounted(() => {
      unsub = props.editor.on("openSlashMenu", () => {
        visible.value = true;
        selectedIndex.value = 0;
      });
    });

    onBeforeUnmount(() => unsub?.());

    return () => {
      if (!visible.value) return null;
      return h(
        "div",
        { class: "gotipe-slash-menu", role: "listbox" },
        props.commands.map((cmd, i) =>
          h(
            "div",
            {
              class: `gotipe-slash-menu-item ${i === selectedIndex.value ? "selected" : ""}`,
              role: "option",
              "aria-selected": i === selectedIndex.value,
              onClick: () => {
                cmd.execute(props.editor);
                visible.value = false;
              },
            },
            [
              h("span", { class: "gotipe-slash-menu-item-icon" }, cmd.icon),
              h("span", {}, cmd.name),
            ],
          ),
        ),
      );
    };
  },
});
