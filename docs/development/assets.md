# Images and files

Uploading has a single contract: `saveAsset(host, blob, kind)` from `@gotipe/core`.
`host.saveAsset` saves the file and returns a durable path; `host.resolveAsset`
turns the path into a URL that can be displayed. The host owns its blob URLs and their
release. Errors are visible in the interface and in `host.onError`.

Without a host, files up to 10 MiB are included in the document as base64 data URLs. This lets you
save JSON/Markdown and open it after a reload. Larger files require
host storage. The main image types are PNG/JPEG/GIF/WebP; executable SVG is not accepted
as an inline upload. Data attachments are downloaded rather than opened as HTML pages.

Editing of images and files is handled by the shared ImageBlock/FileBlock from `@gotipe/react/media`;
BlockEditor and PageEditor connect them through `MediaBlocksContext`, while `EditorContent` without
that entry point shows them read-only. An upload does not replace a
changed source and does not resurrect a deleted block. A file paste/drop saves
the batch as a single undoable change; if the document or
selection changed during the upload, the late insertion is cancelled with an explicit error.
A retry must be explicit.

Images support sizing within the container, caption, alternative text,
preview, crop, duplicate, move, delete, and download. Crop uses the browser canvas,
saves a PNG through the same storage contract, and is restored by Undo. A remote
image needs CORS from the server; an animated file becomes a single frame when cropped.
The canvas limit is 16 megapixels. There is no hidden fetch to a third-party proxy.

Catalog search is enabled only through `host.imageSources`:

```ts
const host = {
  imageSources: [{
    id: 'company-library',
    label: 'Library',
    async search(query, signal) {
      // Call your own authenticated asset service; keep provider secrets on its server.
      return [{ id: 'cover', src: 'https://assets.example/cover.png', alt: 'Cover' }];
    },
  }],
};
```

Search cancels a stale request, shows loading/error/empty, accepts only
HTTP(S) results, and limits one page to 40 items. Without an adapter the interface
shows Upload/Link; there are no fake Unsplash/GIPHY tabs. The adapter's owner
complies with the terms of their catalog, attribution, and download tracking.
