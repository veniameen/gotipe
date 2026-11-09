import { defineExtension } from "../types/extension";

export const File = defineExtension({
  name: "file",
  nodes: [
    {
      name: "file",
      group: ["block"],
      content: "empty",
      attrs: {
        url: { type: "string", required: true },
        name: { type: "string", required: true },
        size: { type: "number" },
        mime_type: { type: "string" },
      },
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    },
  ],
  slashCommands: [
    {
      name: "File",
      aliases: ["file", "attachment", "upload"],
      description: "Attach a file",
      icon: "paperclip",
      group: "upload",
      execute: (editor) => {
        editor
          .chain()
          .insertBlockAfter("file", {
            url: "",
            name: "",
            size: null,
            mime_type: "",
          })
          .run();
      },
    },
  ],
});
