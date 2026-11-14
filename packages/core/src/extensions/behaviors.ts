import { defineExtension } from "../types/extension";

export const History = defineExtension({
  name: "history",
  keybindings: [
    {
      key: "mod-z",
      command: (editor) => editor.chain().undo().run(),
    },
    {
      key: "mod-shift-z",
      command: (editor) => editor.chain().redo().run(),
    },
    {
      key: "mod-y",
      command: (editor) => editor.chain().redo().run(),
    },
  ],
});

export interface PlaceholderOptions {
  /**
   * The words of the placeholder. Empty (the default) leaves them to the renderer, which
   * shows its own placeholder in the language of the interface.
   */
  text: string;
}

export const Placeholder = defineExtension<PlaceholderOptions>({
  name: "placeholder",
  options: { text: "" },
  plugin: (options) => ({
    decorations(state) {
      const placeholderOptions = options as PlaceholderOptions;
      const decorations: import("../types/view").Decoration[] = [];
      const blocks = state.doc.blocks;

      if (blocks.length === 1 && blocks[0]?.type === "paragraph") {
        const block = blocks[0]!;
        const isEmpty =
          block.content === null ||
          (Array.isArray(block.content) && block.content.length === 0) ||
          (Array.isArray(block.content) && block.content.every((s) => s.text === ""));
        if (isEmpty) {
          decorations.push({
            type: "placeholder",
            text: placeholderOptions?.text ?? "",
            blockId: block.id,
          });
        }
      }
      return decorations;
    },
  }),
});

export const DragAndDrop = defineExtension({
  name: "dragAndDrop",
  onCreate(_editor) {
    // DragAndDrop behavior is handled at the view/mount level
    // This extension registers the capability
  },
});

export const SlashCommands = defineExtension({
  name: "slashCommands",
  inputRules: [
    {
      pattern: /^\/$/,
      handler: (editor) => {
        editor.emit("openSlashMenu");
      },
    },
  ],
});
