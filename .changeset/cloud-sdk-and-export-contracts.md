---
"@gotipe/sdk": patch
"@gotipe/export": minor
"@gotipe/export-wasm": patch
---

Align the SDK with Cloud authentication, resource envelopes, pagination and error handling. Add optional real PDF/DOCX exports with Unicode fonts in a separate WASM package, shared with the native Cloud converter.

Replace the DOCX adapter with an owned OOXML renderer and patched ZIP codec; upgrade the isolated PDF compiler. Preserve Unicode, relationships, marks, images and metadata, and reject invalid XML characters. Cloud uses the patched Go toolchain and dependency graph. Upstream source-release security gates remain documented and enforced.

HTML presentation options now apply shared semantic styling and block classes across SSR and export. Format-inapplicable options fail explicitly; PDF/DOCX option types no longer advertise HTML presentation controls.
