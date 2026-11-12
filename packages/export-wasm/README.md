# @gotipe/export-wasm

Optional PDF and DOCX renderer for `@gotipe/export`. Install both packages to
enable `exportToPdf` and `exportToDocx`:

```sh
pnpm add @gotipe/export @gotipe/export-wasm
```

The separate WebAssembly binary includes GoTipe's PDF layout/rendering code and
bundled Unicode fonts. Its measured size is recorded during release acceptance.
It is downloaded and initialized only on the first PDF/DOCX call; importing the
editor or the export package does not initialize this renderer. Applications can keep the
module out of their build entirely when they need only HTML, Markdown or text.

Browser bundlers must serve the `.wasm` file referenced by the generated module
with `application/wasm`. The Node entry initializes from the local package file.
No remote compilation service, system fonts or user document upload is used.

Unsupported block types return an error instead of producing an incomplete
document. Embedded PNG/JPEG/GIF images are decoded with bounded dimensions and
memory. URL images require an explicit `resolveImage` host callback in PDF/DOCX
options; the renderer itself never fetches them. See the repository
release-readiness plan for format acceptance. Font and dependency licenses ship in `licenses/` and
`THIRD_PARTY_NOTICES.md`.
