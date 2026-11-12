---
title: Rust crates
description: The MIT Rust crates behind the WebAssembly engine, the PDF and DOCX exporter and the server converter, and how to build them from source.
license: MIT
---

The document engine, the collaboration CRDT, versions, review state and the PDF and DOCX exporters are written in Rust. Nine crates in `crates/` of the GoTipe repository build three things: the `@gotipe/wasm` engine, the `@gotipe/export-wasm` exporter and the `gotipe-convert` command-line converter.

> [!NOTE]
> The crates are not published to crates.io in this release. Build them from the GoTipe repository and use them as path dependencies. All of them are version 0.1.0, Rust edition 2021, MIT licensed.

## Crates

| Crate | What it does | Depends on |
| --- | --- | --- |
| `gotipe-schema` | The document model (`Document`, `Block`, `BlockContent`, `TextSpan`, `Mark`), node, mark and attribute specs, schema validation and the default schemas. | — |
| `gotipe-core` | Editor state, transactions and their steps, atomic transforms, selections in UTF-16 offsets and their mapping, commands and clipboard. Re-exports the schema types. | schema |
| `gotipe-crdt` | The collaboration replica `CrdtDocument`: an idempotent log of causally stamped operations over a rich-text CRDT and a movable block tree, plus version vectors, awareness, sync framing and selective undo. | core |
| `gotipe-comments` | Comments, threads, anchors and suggestions, their review state (`ReviewStore`) and their CRDT operations. | core, crdt |
| `gotipe-versioning` | Named versions, diffs of block and text changes, and incremental snapshots, compressed with zstd when the default `compression` feature is on. | core, crdt |
| `gotipe-ai` | AI command types, context building with token estimates, the provider trait, streaming settings, ghost-text state and the PII detector (e-mail addresses, phone numbers, Luhn-checked card numbers). | core |
| `gotipe-export` | HTML, Markdown, plain-text and JSON writers, a Markdown reader, an HTML sanitizer; PDF and DOCX behind features; the `gotipe-convert` binary. | core |
| `gotipe-export-wasm` | WebAssembly bindings `exportPdf` and `exportDocx`. | export |
| `gotipe-wasm` | The `WasmEditor` that the WASM engine of `@gotipe/core` drives: transactions, validation, HTML export and sanitizing, collaboration, versions, review and PII detection. | all of the above except export-wasm |

`gotipe-export` features:

| Feature | Default | Adds |
| --- | --- | --- |
| `html` | yes | HTML writer and the HTML sanitizer |
| `markdown` | yes | Markdown writer and reader |
| `plaintext` | yes | Plain-text writer |
| `pdf` | no | PDF with GoTipe's own layout, text shaping, font subsetting and bundled fonts |
| `docx` | no | DOCX with GoTipe's own OOXML renderer |
| `image-data` | no | Bounded PNG, JPEG and GIF decoding; `pdf` and `docx` turn it on |
| `cli` | no | Required, with `html` and `markdown`, by the `gotipe-convert` binary; adds the CRDT projection of `project-crdt` |

## What the crates become

| Output | Built from | Command | Used by |
| --- | --- | --- | --- |
| `@gotipe/wasm` (`packages/wasm/pkg`) | `gotipe-wasm` | `pnpm build:wasm` | `@gotipe/core` with `engine: "auto"` or `"wasm"` |
| `@gotipe/export-wasm` (`packages/export-wasm/pkg`) | `gotipe-export-wasm`, with `gotipe-export` features `pdf` and `docx` | `pnpm build:export-wasm` | `exportToPdf` and `exportToDocx` in `@gotipe/export` |
| `gotipe-convert` (`target/release/gotipe-convert`) | `gotipe-export`, features `pdf`, `docx` and `cli` | `pnpm build:converter` | GoTipe Cloud export jobs, or your own server |

`@gotipe/core` loads `@gotipe/wasm` with a dynamic import only when the engine is `"auto"` or `"wasm"`; `@gotipe/core/js` never references it. Both engines follow one contract for documents, transactions, UTF-16 offsets, errors and history (see [Engines](/docs/getting-started/engines)). The PDF and DOCX module is a separate download that `@gotipe/export` initializes on the first PDF or DOCX export; the editor never loads it.

## Build from source

You need Node.js, the pnpm version named in the repository's `packageManager`, Rust stable with the `wasm32-unknown-unknown` target, `wasm-pack` and Binaryen's `wasm-opt`.

```sh
rustup target add wasm32-unknown-unknown
pnpm install --frozen-lockfile
pnpm build:wasm
pnpm build:export-wasm
pnpm build:converter
pnpm build
```

- `pnpm build:wasm` runs `wasm-pack build crates/gotipe-wasm --target web --release`, then `wasm-opt -Oz`, then checks the size: `gotipe_wasm_bg.wasm` must stay within 600 KiB after gzip level 9 (`config/wasm-budget.json`).
- `pnpm build:export-wasm` runs `wasm-pack build crates/gotipe-export-wasm --target web --release`.
- `pnpm build:converter` runs `cargo build --locked -p gotipe-export --features pdf,docx,cli --bin gotipe-convert --release`.
- `pnpm build` builds the npm packages, which pick up both `pkg` directories.

Release builds use `opt-level = "z"`, link-time optimization, one codegen unit and stripped symbols.

## Use a crate from Rust

```toml title="Cargo.toml"
[dependencies]
gotipe-export = { path = "../gotipe/crates/gotipe-export", features = ["pdf"] }
```

```rust title="src/main.rs"
use gotipe_export::input::document_from_json;
use gotipe_export::pdf::{to_pdf, PdfOptions};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let json = std::fs::read_to_string("document.json")?;
    let document = document_from_json(&json)?;
    std::fs::write("document.md", gotipe_export::to_markdown(&document))?;
    std::fs::write("document.pdf", to_pdf(&document, &PdfOptions::default())?)?;
    Ok(())
}
```

`document_from_json` accepts the public JSON document of `editor.getJSON()` as well as the crate's own tagged form. The PDF and DOCX writers take images only as embedded base64 PNG, JPEG or GIF data; they never fetch URLs, so resolve image addresses before you export.

## gotipe-convert

`gotipe-convert <format>` reads its input from standard input (at most 64 MiB) and writes the result to standard output. On failure it prints the error to standard error and exits with status 1.

```sh
gotipe-convert pdf < document.json > document.pdf
gotipe-convert parse-markdown < notes.md > notes.json
```

| Format | Input | Output |
| --- | --- | --- |
| `html` | Document JSON | HTML |
| `markdown` | Document JSON | Markdown |
| `plaintext` | Document JSON | Plain text |
| `json` | Document JSON | The normalized public document |
| `pdf` | Document JSON | PDF: A4, 12 pt text, 72 pt margins |
| `docx` | Document JSON | DOCX |
| `parse-markdown` | Markdown | Document JSON |
| `project-crdt` | `{ "document": …, "updates": […] }` | The document after applying the collaboration updates |

A converter built without the `pdf` or `docx` feature answers those formats with "unsupported export format". For `pdf` and `docx`, images must already be embedded as base64 data, as described above.

The converter's Markdown reader and writer are a separate Rust implementation. The reader follows the document mapping of `@gotipe/markdown`; the writer produces canonical Markdown and does not keep the source of untouched blocks after an edit. Where file bytes matter, use [`@gotipe/markdown`](/docs/conversion/markdown).

## Checks

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --workspace --all-features
```

## Licences

All crates are MIT. The PDF exporter bundles fonts that keep their own licences: Libertinus Serif (SIL OFL 1.1), New Computer Modern (GUST Font License 1.0), DejaVu Sans Mono (Bitstream Vera and DejaVu licences) and Noto Emoji (SIL OFL 1.1). `@gotipe/export-wasm` ships their notices in `licenses/` and `THIRD_PARTY_NOTICES.md`. See [Licensing](/docs/resources/licensing).

## Related

- [Engines](/docs/getting-started/engines): JS and WASM engines and when each loads.
- [Server conversion](/docs/conversion/server): `gotipe-convert` in a service.
- [PDF](/docs/conversion/pdf) and [DOCX](/docs/conversion/docx): export options and limits.
- [Collaboration](/docs/collaboration/overview): the CRDT in practice.
