import { BlockEditor } from "@gotipe/block-editor";
import { defineExtension } from "@gotipe/core";
import { MinimalPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";

const CalloutExtension = defineExtension({
  name: "callout",
  nodes: [
    {
      name: "callout",
      group: ["block"],
      content: "richText",
      attrs: {
        emoji: { type: "string", default: "💡" },
        type: { type: "string", default: "info" },
      },
      topLevel: true,
      marksAllowed: "all",
      leaf: false,
      allowsChildren: false,
    },
  ],
  keybindings: [
    {
      key: "Mod-Shift-c",
      command: (editor) =>
        editor.chain().insertBlockAfter("callout", { emoji: "💡", type: "info" }).run(),
    },
  ],
  slashCommands: [
    {
      name: "Callout",
      aliases: ["notice"],
      description: "Insert a custom callout",
      icon: "alert-circle",
      group: "insert",
      execute: (editor) => {
        editor.chain().insertBlockAfter("callout", { emoji: "💡", type: "info" }).run();
      },
    },
  ],
});

export function CustomExample() {
  const editor = useEditor({
    extensions: [MinimalPreset, CalloutExtension],
    content: {
      version: 1,
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          attrs: {},
          content: [
            {
              text: "This editor uses MinimalPreset + a custom Callout extension. Press Cmd+Shift+C to insert a callout.",
              marks: [],
            },
          ],
          children: [],
        },
      ],
    },
  });

  return (
    <div data-gotipe-example="custom">
      <BlockEditor editor={editor} showThemeToggle={false} showAiCommandBar={false} />
    </div>
  );
}
