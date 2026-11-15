---
title: Performance
description: Measured bundle and WASM sizes, what loads when, and how GoTipe behaves with large documents.
---

GoTipe keeps its cost visible: every JavaScript graph has a size budget that the build checks,
heavy parts load only when used, and the limits for large documents are explicit. The numbers
below were measured on the 0.1.0 release build (2026-11-12). Measure your own application too:
your bundler, your extensions and your content change them.

## JavaScript size

Each figure is the sum of the gzip (level 9) sizes of every JavaScript file reachable from the
package entry through static and literal dynamic imports. Shared files count once; framework
peers and the already counted core are excluded. It is not a prediction of your bundle after
tree shaking, and CSS, fonts and WASM are not included.

| Graph | gzip | Budget |
|---|---:|---:|
| `@gotipe/core` with the Markdown parser | 95,659 B | 125 KiB |
| `@gotipe/react`, including `@gotipe/i18n` (on top of core) | 36,441 B | 40 KiB |
| `@gotipe/vue` | 3,104 B | 8 KiB |
| `@gotipe/svelte` | 491 B | 7 KiB |
| `@gotipe/solid` | 445 B | 6 KiB |
| `@gotipe/collaboration` | 5,079 B | 12 KiB |
| `@gotipe/ai` | 7,536 B | 12 KiB |
| `@gotipe/export` (without the WASM module) | 1,543 B | 4 KiB |

A build that goes over a budget fails; raising a budget needs a recorded decision with
measurements.

## WebAssembly

| Module | Raw | gzip | Loaded |
|---|---:|---:|---|
| `@gotipe/wasm`, the core engine | 825,703 B | 302,506 B (budget 325 KiB) | When `createEditor` uses the WASM engine |
| `@gotipe/export-wasm`, PDF and DOCX with fonts | 14,676,786 B | about 8.6 MB | On the first `exportToPdf` or `exportToDocx` |

The core engine row was measured on 2026-11-15. HTML, Markdown and HTML cleaning left the
module for the core JavaScript, one code for both engines; the 0.1.0 build of 2026-11-12
had 1,497,834 B and 589,986 B gzip under a 600 KiB budget.

The JS engine needs no WASM at all. Choose it with `engine: "js"` or import from
`@gotipe/core/js`, which has no reference to `@gotipe/wasm`; see [Engines](/docs/getting-started/engines).
Real-time collaboration needs the WASM engine.

## What loads when

| You use | What loads |
|---|---|
| Any `@gotipe/*` import | Nothing runs: no listeners, requests or fonts until you create something. |
| `createEditor()` with the default `engine: "auto"` | The core WASM module if `@gotipe/wasm` is installed; otherwise the JS engine. |
| `@gotipe/core/js` | JavaScript only. |
| `exportToHtml`, `exportToMarkdown`, `exportToPlainText` | Nothing more. |
| `exportToPdf`, `exportToDocx` | `@gotipe/export-wasm`, once per page load or process. |
| Code highlighting through `@gotipe/block-editor/shiki` | Shiki's JavaScript regex engine, and each grammar when a block needs it. Highlighting is off by default. |

## Large documents

The editor renders every block into the DOM; there is no list virtualization. Long documents
cost DOM nodes and layout time in proportion to their size, so test the largest documents your
users have.

Indicative timings of the Markdown codec on an 80 KB page of 2,000 blocks:

| Operation | Time |
|---|---:|
| Parse the page | about 190 ms |
| Serialize after an edit (unchanged blocks reuse their source) | about 16 ms |

They are single measurements, not a benchmark suite; your hardware and content change them.

Fixed limits that apply to large content:

| Where | Limit |
|---|---|
| Files embedded without host storage | 10 MiB each, as `data:` URLs in the document |
| PDF export | 64 nesting levels, 100,000 blocks, 10,000 pages |
| PDF and DOCX images | 4096 px per side; 10 MiB of data per image, as the editor's inline upload limit; 64 MiB per export |
| Migration input | 100,000 values, 128 levels, 32 Mi UTF-16 code units of text |
| `gotipe-convert` input | 64 MiB |
| Cloud document body | `EXPORT_MAX_DOCUMENT_SIZE`, 10 MiB by default, at most 64 MiB |
| Cloud real-time message | 1 MiB |
| Cloud stored collaboration state per document | 60 MiB |
| Cloud conversion | 2 minutes per conversion, 5 minutes per export job |

> [!NOTE]
> Cloud reads a document that has saved collaboration updates by running the native converter
> over its baseline and all those updates, in a separate process for each read, version and
> export. The server merges a document's updates into one record as they accumulate, but it
> never drops an operation, so the cost of reading a document still grows with its editing
> history until its content is replaced.

## Related

- [Engines](/docs/getting-started/engines)
- [PDF export](/docs/conversion/pdf)
- [Real-time sync](/docs/cloud/realtime)
- [Browser support](/docs/resources/browser-support)
