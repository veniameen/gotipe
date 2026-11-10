import { saveAsset } from "../assets";
import { insertDraftPayload } from "../clipboard/paste-rules";
import { GoTipeError } from "../error";
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
    allowedTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
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
      handler: async (editor, data, configured) => {
        if (!(data instanceof File)) return;
        const options = configured as ImageOptions;
        if (!Number.isFinite(options.maxSize) || options.maxSize < 0 || data.size > options.maxSize)
          throw new GoTipeError("ASSET_TOO_LARGE", "The image exceeds the configured maximum size");
        if (!options.allowedTypes.includes(data.type.toLowerCase()))
          throw new GoTipeError(
            "ASSET_UNSUPPORTED",
            "This image type is not allowed by the editor",
          );
        const storage = options.upload
          ? { saveAsset: async () => ({ src: await options.upload!(data) }) }
          : editor.host;
        const saved = await saveAsset(storage, data, "image");
        if (editor.isDestroyed) return;
        insertDraftPayload(editor, {
          blocks: [
            {
              id: crypto.randomUUID(),
              type: "image",
              attrs: { src: saved.src, alt: saved.name, caption: "" },
              content: null,
              children: [],
            },
          ],
        });
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
        editor.chain().insertBlockAfter("image", { src: "", alt: "" }).run();
      },
    },
  ],
});
