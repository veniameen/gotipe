---
title: Images, files and embeds
description: The Image, File and Embed nodes, uploads through your host, and what the editor UI offers for each.
packages: ["@gotipe/core", "@gotipe/react"]
license: MIT
---

Three leaf blocks point at content outside the text: `image`, `file` and `embed`. The document stores an address and a little metadata; the bytes live wherever your host puts them. Uploads go through one host callback, so the editor never decides where files are stored.

```demo
media
```

| Extension | Node | Presets |
| --- | --- | --- |
| `Image` | `image` | Default, Full, `PageEditor` |
| `File` | `file` | Full, `PageEditor` |
| `Embed` | `embed` | Full |

The React views described below (`ImageBlock`, `FileBlock` and the embed card) are used by `BlockEditor` and `PageEditor`. `ImageBlock` and `FileBlock` come from `@gotipe/react/media`: `@gotipe/react`'s `EditorContent` shows images and files read-only unless that entry is provided through `MediaBlocksContext` (see [React](/docs/frameworks/react)).

## Image

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `src` | `string` | required | Address or document path of the image. Empty while the block waits for an image. |
| `alt` | `string` | `""` | Alternative text. |
| `width` | `number` | — | Display width in pixels, set by resizing. |
| `height` | `number` | — | Display height in pixels; resizing clears it. |
| `caption` | `string` | `""` | Caption under the image. |

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxSize` | `number` | `10485760` (10 MiB) | Largest pasted or dropped image, in bytes. |
| `allowedTypes` | `string[]` | `["image/png", "image/jpeg", "image/gif", "image/webp"]` | MIME types accepted on paste and drop. |
| `upload` | `(file: File) => Promise<string>` | — | Stores a pasted or dropped image and returns its address. Takes precedence over `host.saveAsset` for paste and drop. |

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { Image } from "@gotipe/core/extensions";
import { DefaultPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [DefaultPreset, Image.configure({ maxSize: 4 * 1024 * 1024 })],
});
editor.chain().insertBlockAfter("image", { src: "", alt: "" }).run();
```

| Command | Description |
| --- | --- |
| `insertBlockAfter("image", { src, alt })` | Inserts an image after the current block. With an empty `src` the block shows the image picker. |
| `setBlockAttrs(blockId, { alt, caption, width })` | Changes an image. |

The "/" menu lists **Image**.

Pasting or dropping image files on the editor inserts image blocks. Each file must fit `maxSize` (`ASSET_TOO_LARGE` otherwise) and `allowedTypes` (`ASSET_UNSUPPORTED`), and is stored through `upload` when you set it, otherwise through `host.saveAsset`, otherwise embedded as a `data:` URL. Several files go in as one undoable change. If the document or the selection changes while files upload, the insertion is cancelled with an error; insert the files again.

In the editor UI an empty image offers **Upload**, **By link** (an http or https address) and one tab per image catalog your host supplies, and accepts a dropped file. A placed image has resize handles on both sides (drag, or Left and Right for 16 px steps), a caption field and a toolbar: alternative text, original size, fit to width, caption, zoom, download, and a menu with crop, replace, copy URL, copy link to block, duplicate, move up or down and delete. Crop draws on a canvas, saves a PNG through the same storage path and is undone with Undo; it needs CORS for remote images, keeps only the first frame of an animation and is limited to 16 megapixels.

Without `width` an image is shown at its own size, at most the width of the column. An image without a size of its own, such as an SVG with a `viewBox` and no `width` or `height`, fills the column, and "original size" sets the column's width; resizing gives it a width like any other image.

> [!NOTE]
> `Image.configure` options apply to paste and drop only. The Upload button and the drop zone of an empty image always store files through `host.saveAsset` (or the inline fallback) and accept PNG, JPEG, GIF and WebP. Implement `host.saveAsset` to have one storage path for every upload.

## Uploads through the host

Uploads go through `EditorHost`, passed as `host` to `createEditor` or `PageEditor`:

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";

const editor = await createEditor({
  extensions: [FullPreset],
  host: {
    async saveAsset(file, { kind, name, mediaType }) {
      const body = new FormData();
      body.append("file", file, name);
      body.append("kind", kind);
      body.append("type", mediaType);
      const response = await fetch("/api/assets", { method: "POST", body });
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      const { path } = (await response.json()) as { path: string };
      return { src: path, name };
    },
    resolveAsset: (src) => (src.startsWith("assets/") ? `/files/${src}` : src),
    onError: (error) => console.error(error.code, error.message),
  },
});
```

| Callback | Description |
| --- | --- |
| `saveAsset(file, { kind, name, mediaType, size })` | Stores an image (`kind: "image"`) or file (`kind: "file"`) and returns `{ src, name? }`, the path or URL that goes into the document. Throw to report a failure. |
| `resolveAsset(src)` | Turns a stored path into something an `<img>` can show under your CSP, such as a `data:` URL, or returns `null` when the asset is unavailable. Without it, `src` is used as it is. |
| `imageSources` | Image catalogs searched from the image picker. Search and credentials belong to your service. |
| `onError(error)` | Receives `ASSET_SAVE_FAILED`, `ASSET_RESOLVE_FAILED`, `ASSET_UNSUPPORTED`, `ASSET_TOO_LARGE` and every other editor error. |

Without `saveAsset`, files up to 10 MiB are embedded in the document as base64 `data:` URLs, so a saved document still opens after a reload. Larger files need host storage. A cancelled or failed insertion cannot undo an upload that already finished; cleaning up storage is the host's job. See [Host](/docs/concepts/host) for every callback.

## File

`file` is an attachment card.

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | `string` | required | Address or document path of the file. Empty while the block waits for a file. |
| `name` | `string` | required | File name shown on the card. |
| `size` | `number` | — | Size in bytes. |
| `mime_type` | `string` | — | MIME type. |

`File` has no options. Insert it with `insertBlockAfter("file", { url: "", name: "", size: null, mime_type: "" })` or the "/" menu's **File**. Dropping or pasting a file that is not an image inserts a file block, stored the same way as images.

In the editor UI an empty file block offers **Add a file**, **By link** (an address and an optional name) and a drop zone. The card shows the name, the MIME type and size, and **Replace** and **Remove**. Clicking the name opens the file through `host.openLink` in a new tab; a file embedded as a `data:` URL is downloaded instead of opened.

## Embed

`embed` is an external page shown as a link card.

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| `url` | `string` | required | Address of the page. Empty while the block waits for one. |
| `type` | `"youtube" \| "vimeo" \| "twitter" \| "codepen" \| "figma" \| "generic"` | `"generic"` | Kind of page. |
| `width` | `number` | — | Stored for your own view; the built-in card ignores it. |
| `height` | `number` | — | Stored for your own view; the built-in card ignores it. |

`Embed` has no options. Insert it with `insertBlockAfter("embed", { url: "", type: "generic" })` or the "/" menu's **Embed**. An empty embed asks for an address; only http and https addresses are accepted, and `https://` is added when the scheme is missing. The editor then sets `type` from the host name: `youtube.com` and `youtu.be`, `vimeo.com`, `twitter.com` and `x.com`, `codepen.io` and `figma.com`; any other site is `generic`.

The card shows the site, the readable address and an **Open link** button. GoTipe draws no third-party frames: no player, no script from the embedded site. To show a player, pass your own view for `embed` in `blockViews` (see [Math](/docs/extensions/math#react) for a block view example).

## Markdown

| Node | Markdown |
| --- | --- |
| `image` | A paragraph holding only `![alt](src "caption")`. `width` and `height` are not written. |
| `file` | A paragraph holding only `[name](path)`; without a name, the path is the link text |
| `embed` | A link line `[name or address](address)`; it reads back as a paragraph with a link |

A file block reads back as a file only when its link has no scheme (a relative or `/` path) and its text equals the decoded file name of the path. Otherwise it reads back as a paragraph with a link. An image inside a line of text stays verbatim text and is not an image block.

> [!NOTE]
> Markdown has no embed syntax: `getMarkdown()` writes an embed as a link to its address, and it reads back as a paragraph with that link. Keep documents with embeds as JSON to keep them as embeds. `PageEditor` does not offer embeds.

> [!NOTE]
> PDF and DOCX export embed PNG, JPEG, GIF and WebP images up to 10 MiB, the formats and size the editor uploads; images given by URL need a `resolveImage` callback. Empty image, file and embed blocks export as nothing. See [PDF](/docs/conversion/pdf).

## Related

- [Host](/docs/concepts/host): `saveAsset`, `resolveAsset`, `openLink` and `onError`.
- [Security](/docs/resources/security): URL validation and CSP for `data:` images.
- [Markdown](/docs/conversion/markdown): images and files in Markdown files.
- [Block editor](/docs/ui/block-editor): the UI around these blocks.
