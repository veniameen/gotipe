# @gotipe/export-wasm

Optional PDF and DOCX compiler for `@gotipe/export`. Install both packages to
enable `exportToPdf` and `exportToDocx`:

```sh
pnpm add @gotipe/export @gotipe/export-wasm
```

The separate WebAssembly binary is approximately 35.5 MB before HTTP compression.
It contains Typst, the DOCX container writer and Unicode fonts. It is downloaded
and initialized only on the first PDF/DOCX call; importing the editor or the
export package does not initialize this compiler. Applications can keep the
module out of their build entirely when they need only HTML, Markdown or text.

Browser bundlers must serve the `.wasm` file referenced by the generated module
with `application/wasm`. The Node entry initializes from the local package file.
No remote compilation service, system fonts or user document upload is used.

Unsupported block types return an error instead of producing an incomplete
document. Embedded PNG/JPEG/GIF images are decoded with bounded dimensions and
memory. URL images require an explicit `resolveImage` host callback in PDF/DOCX
options; the compiler itself never fetches them. See the repository
release-readiness plan for remaining format-fidelity work. Font and compiler licenses ship in `licenses/` and
`THIRD_PARTY_NOTICES.md`.
