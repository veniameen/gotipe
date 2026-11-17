# @gotipe/sdk

A small typed client for the REST API of GoTipe Cloud, the GoTipe backend you run yourself:
documents, versions, comments, export jobs, AI, organizations and usage. It has no
dependencies and uses the global `fetch`, so it runs in browsers and in Node.

[Docs](https://gotipe.com/docs/cloud/sdk/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/sdk
```

## Usage

```ts
import { GoTipeApiError, GoTipeClient } from "@gotipe/sdk";

const client = new GoTipeClient({
  baseUrl: "https://api.example.com", // your GoTipe Cloud instance
  token: process.env.GOTIPE_TOKEN,
});

const created = await client.createDocument({
  title: "Launch plan",
  content: {
    version: 1,
    blocks: [{ id: "p1", type: "paragraph", attrs: {}, content: [{ text: "Draft", marks: [] }], children: [] }],
  },
});

// A key makes a retry safe: within 24 hours the server returns the first result.
await client.addComment(
  created.id,
  { blockId: "p1", content: "Who owns this?", from: 0, to: 5 },
  { idempotencyKey: crypto.randomUUID() },
);

try {
  await client.createExportJob(created.id, "pdf");
} catch (error) {
  if (error instanceof GoTipeApiError && error.code === "QUOTA_EXCEEDED") console.warn("Limit reached");
  else throw error;
}
```

- Options: `baseUrl`, `token` (sent as `Authorization: Bearer`), `apiKey` (used without a
  token), `timeout` (default 30000 ms). In browsers, pass short-lived tokens, never API keys.
- Documents: `listDocuments`, `getDocument`, `createDocument`, `updateDocument`,
  `deleteDocument`.
- Versions: `listVersions`, `createVersion`, `restoreVersion`.
- Comments: `listComments`, `addComment`, `replyToComment`, `resolveComment`,
  `deleteComment`.
- Exports and AI: `createExportJob`, `getExportJob`, `aiGenerate` (not streamed).
- Account: `getOrganization`, `getUsage`.
- A response outside 2xx rejects with `GoTipeApiError` (`code`, `message`, `status`).
  Top-level response fields are renamed to camelCase.

The SDK covers part of the API; see the [REST API](https://gotipe.com/docs/cloud/rest-api/)
for the rest, and [GoTipe Cloud](https://gotipe.com/docs/cloud/overview/) for running the
server.

## License

MIT — see [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/sdk/LICENSE).
