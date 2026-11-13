---
title: Server-side conversion
description: Convert documents on a server with the npm packages in Node, the native gotipe-convert binary, or GoTipe Cloud export jobs.
packages: ["@gotipe/export", "@gotipe/export-wasm", "@gotipe/sdk"]
license: MIT
---

There are three ways to convert documents without a browser. All of them use the same PDF
and DOCX renderer as the browser, so a PDF made on the server matches one made on the client.

| Path | Use it when | PDF and DOCX options |
|---|---|---|
| `@gotipe/export` in Node | You run Node and want every option | All, including `resolveImage` |
| `gotipe-convert` binary | You run another language, or a batch job without Node | Defaults only |
| GoTipe Cloud export jobs | Documents live in [GoTipe Cloud](/docs/cloud/overview) | Defaults only |

## Node

Create a headless editor, load the document JSON and call the export functions. The editor
needs no DOM and no WASM engine; `@gotipe/export-wasm` loads its binary from the package
folder.

```ts title="convert.ts"
import { readFile, writeFile } from "node:fs/promises";
import { createHeadlessEditor } from "@gotipe/core/server";
import { exportToDocx, exportToMarkdown, exportToPdf } from "@gotipe/export";

const editor = await createHeadlessEditor({ extensions: [] });
try {
  editor.setContent(JSON.parse(await readFile("document.json", "utf8")));
  await writeFile("document.md", exportToMarkdown(editor));
  await writeFile(
    "document.pdf",
    await exportToPdf(editor, {
      pageSize: "letter",
      footerTemplate: "Internal",
      resolveImage: async (source) => new Uint8Array(await readFile(new URL(source))),
    }),
  );
  await writeFile("document.docx", await exportToDocx(editor, { title: "Report" }));
} finally {
  editor.destroy();
}
```

The `resolveImage` above reads `file:` URLs; return bytes from wherever your images live.
`renderToHtml`, `renderToMarkdown` and `renderToText` from `@gotipe/core/server` convert
document JSON without creating an editor yourself. See [Import and export](/docs/conversion/overview).

## gotipe-convert

`gotipe-convert` is the native Rust converter that GoTipe Cloud runs. It reads one input from
stdin and writes the result to stdout. It is not published as a download; build it from the
repository with a stable Rust toolchain:

```sh
cargo build --locked --release -p gotipe-export --features pdf,docx,cli --bin gotipe-convert
# or: pnpm build:converter
```

The binary is `target/release/gotipe-convert`, with the export fonts compiled in.

```sh
gotipe-convert pdf < document.json > document.pdf
gotipe-convert markdown < document.json > document.md
gotipe-convert parse-markdown < README.md > document.json
```

| Command | Input | Output |
|---|---|---|
| `html` | Document JSON | HTML fragment, the same as `serializeHtml` and `getHTML()` |
| `markdown` | Document JSON | Markdown |
| `plaintext` | Document JSON | Plain text |
| `json` | Document JSON | The same document, normalized and pretty-printed |
| `pdf` | Document JSON | PDF: A4, 12 pt, 72 pt margins, no header or footer |
| `docx` | Document JSON | DOCX without title, author or description |
| `parse-markdown` | Markdown | Document JSON, parsed with the default block schema |
| `project-crdt` | `{ "document": baseline, "updates": [envelopes] }` | Document JSON after applying the [collaboration updates](/docs/cloud/realtime) |

Document JSON is the public format (`{ "version": 1, "blocks": [...] }`). Input is limited to
64 MiB. On failure the binary prints the error to stderr, writes nothing to stdout and exits
with status 1.

For `pdf` and `docx`, images must already be embedded as `data:` URLs: the binary has no
`resolveImage`, and a URL image fails. The `html` command writes the same HTML as the
`serializeHtml` function of `@gotipe/core`; `markdown` maps formulas and embeds as
`@gotipe/markdown` does. Errors name the same causes as the
[`ExportError` codes](/docs/conversion/pdf#errors).

## Cloud export jobs

GoTipe Cloud converts stored documents in background workers that run `gotipe-convert`.
A job is asynchronous: create it, poll it, then download the file from a signed URL.

```ts title="export-job.ts"
import { GoTipeClient } from "@gotipe/sdk";

const client = new GoTipeClient({ baseUrl: "https://api.example.com", token: process.env.GOTIPE_TOKEN });
const documentId = "6f1c2b8e-0d1a-4f5e-9a63-2a7d1e0b9c44";

let job = await client.createExportJob(documentId, "pdf");
while (job.status === "pending" || job.status === "processing") {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  job = await client.getExportJob(documentId, job.id);
}
if (job.status === "failed" || !job.url) throw new Error(job.error ?? "Export failed");
const pdf = new Uint8Array(await (await fetch(job.url)).arrayBuffer());
```

The same with HTTP:

```sh
curl -X POST https://api.example.com/v1/exports \
  -H "Authorization: Bearer $GOTIPE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: export-6f1c2b8e-pdf-1" \
  -d '{"document_id": "6f1c2b8e-0d1a-4f5e-9a63-2a7d1e0b9c44", "format": "pdf"}'

curl https://api.example.com/v1/exports/JOB_ID -H "Authorization: Bearer $GOTIPE_TOKEN"
```

- **Formats:** `html`, `markdown`, `plaintext`, `json`, `pdf`, `docx`. The request has only
  `document_id` and `format`; PDF and DOCX use the defaults in the table above.
- **Access:** the `export:use` scope and at least viewer access to the document. The job
  exports the current content, including collaboration updates not yet saved as a baseline.
- **Statuses:** `pending`, `processing`, `completed` (with `url`) or `failed` (with `error`).
  A conversion error is recorded, not retried.
- **Downloads:** `url` is a presigned object-storage URL valid for one hour; ask for the job
  again to get a fresh one. Completed artifacts are deleted 24 hours after completion, failed
  jobs after 7 days; after that the job returns `404`.
- **Quotas:** each request counts against the monthly export limit of the account's plan
  (10 on the free plan). See [REST API](/docs/cloud/rest-api#quotas).

The worker pool is configured on the server: `EXPORT_WORKERS` (default 4, at most 16),
`EXPORT_POLL_INTERVAL` (default `1s`) and `EXPORT_MAX_DOCUMENT_SIZE` (default 10 MiB). One
conversion may run for 2 minutes and one job for 5 minutes; a worker that dies leaves its job
to be claimed again after 10 minutes, at most 5 times.

> [!NOTE]
> Cloud jobs cannot set page size, margins, headers, footers or DOCX metadata, and they cannot
> fetch images: a stored document must embed its images as `data:` URLs to export to PDF or
> DOCX. For those options, run `@gotipe/export` in Node. There is no import endpoint.

## Related

- [PDF export](/docs/conversion/pdf) and [DOCX export](/docs/conversion/docx)
- [REST API: exports](/docs/cloud/rest-api#exports)
- [GoTipe Cloud](/docs/cloud/overview)
