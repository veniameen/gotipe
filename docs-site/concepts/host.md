---
title: Host
description: The EditorHost contract, how GoTipe stores and shows files, opens links, validates URLs and reports errors through your application.
packages: ["@gotipe/core"]
license: MIT
---

The editor never decides where files live, how links open or how errors are shown. It
asks the host: an object you pass as `createEditor({ host })` or to `PageEditor`. Every
member is optional; without a host the editor works on its own, with the defaults below.

## Pass a host

```ts title="host.ts"
import { type EditorHost, GoTipeError } from "@gotipe/core";

export const host: EditorHost = {
  async saveAsset(file, { name }) {
    const body = new FormData();
    body.append("file", file, name);
    const response = await fetch("/api/assets", { method: "POST", body });
    if (!response.ok) throw new GoTipeError("ASSET_SAVE_FAILED", `Upload failed: ${response.status}`);
    const { path } = (await response.json()) as { path: string };
    return { src: path, name };
  },
  resolveAsset(src) {
    // Our own paths go through the asset route; absolute URLs stay as they are.
    return /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : `/api/assets/${encodeURIComponent(src)}`;
  },
  openLink(href, { newTab }) {
    if (newTab) window.open(href, "_blank", "noopener,noreferrer");
    else window.location.assign(href);
  },
  onError(error) {
    console.warn(error.code, error.message);
  },
};
```

```ts title="editor.ts"
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { host } from "./host";

const editor = await createEditor({ extensions: [DefaultPreset], host });
```

`editor.host` returns the object you passed, or `{}`.

## Reference

| Member | Type | Default | Description |
|---|---|---|---|
| `saveAsset` | `(file: Blob, info: { kind: "image" \| "file"; name: string; mediaType: string; size: number }) => Promise<{ src: string; name?: string }>` | Inline `data:` URL | Store a pasted, dropped or picked file. Return the path or URL to put into the document. Throw to report a failure. |
| `resolveAsset` | `(src: string) => Promise<string \| null> \| string \| null` | `src` as stored | Turn a document path such as `assets/diagram.png` into a URL the page can show. Return `null` when the file is unavailable. |
| `openLink` | `(href: string, info: { blockId: string \| null; newTab: boolean }) => void` | `window.open` in a new tab | Open a link the user activated. |
| `onError` | `(error: GoTipeError) => void` | Console, when nothing else listens | Receive every reported error. |
| `imageSources` | `ImageSource[]` | none | Image catalogs to search in the image dialog. |

## Files and images

The editor calls `saveAsset` when the user pastes or drops files, uploads an image or file
from a block, or crops an image. `info.kind` is `"image"` for images and `"file"` for other
attachments.

- Without `saveAsset`, files up to 10 MiB are embedded in the document as base64 `data:`
  URLs, so JSON and Markdown keep them after a reload. Larger files fail with
  `ASSET_TOO_LARGE`.
- Images must be PNG, JPEG, GIF or WebP, with or without a host; others fail with
  `ASSET_UNSUPPORTED`. SVG is not accepted as an upload.
- An empty `src`, or a `javascript:` or `vbscript:` URL, fails with `ASSET_SAVE_FAILED`.
- If the document or selection changes while an upload runs, the insertion is cancelled
  with `ASSET_SAVE_FAILED` and the user inserts again. The stored file stays: deleting
  orphaned uploads is up to your storage.

Pasted and dropped images also obey the `Image` extension's options:

```ts
import { DefaultPreset } from "@gotipe/core/presets";
import { Image } from "@gotipe/core/extensions";

const extensions = [
  DefaultPreset,
  Image.configure({ maxSize: 5 * 1024 * 1024, allowedTypes: ["image/png", "image/jpeg"] }),
];
```

The option `upload: (file) => Promise<string>`, when set, stores those images instead of
`saveAsset` and returns the `src`.

When you provide `resolveAsset`, the React renderer passes every image and file source
through it, and the Vue renderer every image source, including `https:` and `data:` URLs.
Return the sources you don't own unchanged. Return `null` for a missing file; the block
shows it as unavailable. A thrown error is reported as `ASSET_RESOLVE_FAILED`. Under a
strict CSP, return `data:` URLs to keep `img-src` at `'self' data:`.

`saveAsset(host, file, kind)`, `encodeInlineAsset(file)`, `INLINE_ASSET_LIMIT` and
`IMAGE_MEDIA_TYPES` are exported from `@gotipe/core` for your own upload controls; they
apply the same rules.

### Image catalogs

```ts
import type { EditorHost } from "@gotipe/core";

const host: EditorHost = {
  imageSources: [
    {
      id: "library",
      label: "Library",
      async search(query, signal) {
        const response = await fetch(`/api/images?q=${encodeURIComponent(query)}`, { signal });
        return (await response.json()) as { id: string; src: string; alt: string }[];
      },
    },
  ],
};
```

Each source appears as a tab in the image dialog of the React media block. `search`
receives an `AbortSignal` that fires when a newer search starts. Results may include
`thumbnail` and `attribution`; the dialog shows the first 40 and accepts only `http:` and
`https:` sources. The ids `upload` and `link` are reserved. Keep provider keys on your
server.

## Links

Links never navigate while the user edits: a plain click places the caret. Cmd-click or
Ctrl-click, a middle click, or any click in read-only mode opens the link, and so does a
click on a file block's name. `editor.openLink(href, { blockId, newTab })` does the same
from your code.

Before your `openLink` runs, the editor checks the URL with `toSafeHref`:

| URL | Result |
|---|---|
| `https://…`, `http://…`, `mailto:…` | Allowed |
| Relative: `docs/setup.md`, `#install`, `/pricing` | Allowed as written |
| Any other scheme: `javascript:`, `data:`, `file:`, `tel:` | Blocked with `LINK_BLOCKED`; `openLink` isn't called |

If `openLink` throws, the error is reported as `LINK_OPEN_FAILED`. `toSafeHref(href)` and
`toSafeColor(value)` are exported, so your own controls can apply the same checks.

## Errors

Errors reach you two ways. Calls you make, such as `createEditor`, `dispatch` or
`setContent`, throw or reject. Errors from user actions and background work, such as typing,
paste, uploads, links and extension callbacks, are reported: the editor emits the `error`
event and calls `host.onError`. If neither has a listener, it logs to the console. The
core never shows error text itself; `BlockEditor` shows a toast unless you pass
`errorToast={false}`.

Each error is a `GoTipeError` with `code`, `message` and optional `details`:

| Code | Reported when |
|---|---|
| `ASSET_SAVE_FAILED`, `ASSET_RESOLVE_FAILED` | `saveAsset` or `resolveAsset` failed, or an upload lost its position |
| `ASSET_UNSUPPORTED`, `ASSET_TOO_LARGE` | A file breaks the type or size rules |
| `LINK_BLOCKED`, `LINK_OPEN_FAILED` | A link had an unsafe URL, or `openLink` threw |
| `CLIPBOARD_FAILED` | Clipboard access failed, or a paste no longer fits the document |
| `TRANSFORM_ERROR`, `VALIDATION_ERROR` | An edit from user input couldn't be applied |
| `COMPOSITION_CONFLICT` | An outside change interrupted IME input. `details.text` holds the text being composed, `details.selection` where it was, `details.reason` the cause. |
| `EXTENSION_ERROR` | An extension callback or an event listener threw; `details.extension` names the extension when known |
| `PROPOSAL_STALE`, `PROPOSAL_ACTION_FAILED`, `COMMENT_ACTION_FAILED` | A review action failed |

`WASM_INIT_FAILED`, `PARSE_ERROR`, `EXTENSION_DEPENDENCY_CYCLE`,
`EDITOR_NOT_INITIALIZED`, `COLLABORATION_UNAVAILABLE` and `COLLABORATION_ERROR` come from
your own calls and are thrown, not reported. A `COMPOSITION_CONFLICT` doesn't insert the
interrupted text again; offer the user `details.text` to recover it.

## Related

- [Security and CSP](/docs/resources/security)
- [Media blocks](/docs/extensions/media)
- [Events](/docs/concepts/events)
