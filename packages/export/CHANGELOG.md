# @gotipe/export

## 0.1.2

### Patch Changes

- 971e35f: An app that exports HTML, Markdown or plain text and doesn't install `@gotipe/export-wasm` builds
  in Next.js, with Turbopack and with `next build --webpack`. The exporters are imported inside a
  `try` block, which bundlers treat as an optional import; the `.catch()` on the import before did
  not count, and Next.js stopped at `Module not found: Can't resolve '@gotipe/export-wasm'`.
  `exportToPdf` and `exportToDocx` still reject with `EXPORTER_UNAVAILABLE` without the package,
  and the error's `cause` now tells a package that could not be imported from a WASM file that
  failed to load.
