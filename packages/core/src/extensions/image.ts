import { defineExtension } from "../types/extension";

export interface ImageOptions {
  maxSize: number;
  allowedTypes: string[];
  upload?: (file: File) => Promise<string>;
}

export const Image = defineExtension<ImageOptions>({
  name: "image",
  options: {
    maxSize: 10 * 1024 * 1024,
    allowedTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"],
  },
  nodes: [
    {
      name: "image",
      group: ["block"],
      content: "empty",
      attrs: {
        src: { type: "string", required: true },
        alt: { type: "string", default: "" },
        width: { type: "number" },
        height: { type: "number" },
        caption: { type: "string", default: "" },
      },
      topLevel: true,
      marksAllowed: "none",
      leaf: true,
      allowsChildren: false,
    },
  ],
  pasteRules: [
    {
      match: /^image\//,
      handler: async (editor, data) => {
        if (data instanceof File) {
          const url = URL.createObjectURL(data);
          editor.chain().insertBlockAfter("image", { src: url, alt: "" }).run();
        }
      },
    },
  ],
  slashCommands: [
    {
      name: "Image",
      aliases: ["img", "picture", "photo"],
      description: "Insert an image",
      icon: "image",
      group: "upload",
      execute: (editor) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
          const file = input.files?.[0];
          if (file) {
            const url = URL.createObjectURL(file);
            editor.chain().insertBlockAfter("image", { src: url, alt: "" }).run();
          }
        };
        input.click();
      },
    },
  ],
});
