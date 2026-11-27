---
title: AI provider
description: Connect AiProvider to your backend or GoTipe Cloud to stream responses, cancel requests and validate results while keeping model keys on the server.
packages: ["@gotipe/ai"]
license: MIT
---

An `AiProvider` is the only part of the AI layer that knows where a model runs. It turns a
request and its [context](/docs/ai/overview#context) into text, or into structured
proofreading and review results. Write one against your backend, or against the AI
endpoint of GoTipe Cloud.

> [!CAUTION]
> Never ship a model API key to the browser. A key in your bundle, in local storage or in a
> request header set by page code can be read by anyone who opens the page. Keep the key on
> your server or in GoTipe Cloud, and let the browser send a short-lived token for the
> signed-in user.

## The contract

| Method | Required | Called for | Returns |
| --- | --- | --- | --- |
| `name` | yes | — | A label for the provider. |
| `generateCompletion(context)` | yes | Ghost text, `continueWriting` | `AsyncIterable<string>` |
| `generateSuggestions(prompt, context)` | yes | `AiManager.getSuggestions()` | `Promise<AiSuggestion[]>` |
| `executeCommand(command, context)` | yes | `AiManager.executeCommand()`, and the fallbacks below | `Promise<string>` |
| `streamRewrite(text, context)` | no | `rewrite` (Improve). Fallback: `executeCommand("rewrite")` with `selectedText` | `AsyncIterable<string>` |
| `generateParagraph(prompt, context)` | no | `askAi`, `addParagraph`, `freeText`. Fallback: `executeCommand("addParagraph:" + prompt)` | `AsyncIterable<string>` |
| `proofread(context)` | no | `proofread` | `Promise<AiProofreadSuggestion[]>` |
| `reviewComments(context)` | no | `review` | `Promise<AiComment[]>` |

Without `proofread` or `reviewComments`, those commands fail with "This AI provider does not
support proofreading" or "This AI provider does not support review comments".

## Rules

- **Streaming.** Return an async iterable, such as an async generator, and yield text
  chunks. A chunk that is not a string fails the request. Ghost text shows chunks as they
  arrive; inserted text waits for the end of the stream.
- **Cancellation.** Pass `context.signal` to `fetch`, or stop your work when it aborts. The
  manager drops a late result in any case, and an `AbortError` is never reported.
- **Errors.** Throw an `Error` with a message for the person. The editor reports it as
  `EXTENSION_ERROR` with `details.extension === "ai"`, and the AI command bar shows it.
- **Context.** The context holds detached copies of blocks. Send your server only what the
  model needs.

## A provider for your backend

```ts title="ai-provider.ts"
import type { AiContext, AiProofreadSuggestion, AiProvider, AiSuggestion } from "@gotipe/ai";

async function post(path: string, context: AiContext, extra: object = {}): Promise<Response> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selectedText: context.selectedText,
      blocks: context.surroundingBlocks,
      fullText: context.fullText,
      ...extra,
    }),
    signal: context.signal, // GoTipe aborts it when the request is cancelled
  });
  if (!response.ok) throw new Error(`The assistant is unavailable (${response.status})`);
  return response;
}

async function* stream(path: string, context: AiContext, extra?: object): AsyncIterable<string> {
  const response = await post(path, context, extra);
  if (!response.body) throw new Error("The assistant sent no text");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    yield value;
  }
}

export const backendProvider: AiProvider = {
  name: "my-backend",
  generateCompletion: (context) => stream("/api/ai/continue", context),
  streamRewrite: (text, context) => stream("/api/ai/rewrite", context, { text }),
  generateParagraph: (prompt, context) => stream("/api/ai/paragraph", context, { prompt }),
  async executeCommand(command, context) {
    return (await post("/api/ai/command", context, { command })).text();
  },
  async generateSuggestions(prompt, context): Promise<AiSuggestion[]> {
    return (await post("/api/ai/suggestions", context, { prompt })).json();
  },
  async proofread(context): Promise<AiProofreadSuggestion[]> {
    return (await post("/api/ai/proofread", context)).json();
  },
};
```

Each route authenticates the user, adds the model key on the server, calls the model, and
stops that call when the browser disconnects. The streaming routes send plain UTF-8 text as
it is generated; `/api/ai/command` sends plain text; the other two send JSON.

## Proofreading and review results

The manager checks structured results against the document before anything reaches the
UI. One invalid item fails the whole result.

| Result | Must hold |
| --- | --- |
| `AiProofreadSuggestion` | A unique `id`; the `blockId` of an existing block; `from` and `to` as UTF-16 offsets into the block's text that do not split a character; `originalText` equal to the text between them; `type` `insert` (with `from === to`), `delete` or `replace`; a string `suggestedText`; no overlap with another suggestion in the block. |
| `AiComment` | A unique `id`, an existing `blockId`, a string `body`, valid `from` and `to`, and `quotedText` equal to the text between them. `category` is optional. |

A block's text is the concatenation of its spans' `text`. Compute offsets in that text, not
in Markdown or HTML.

## GoTipe Cloud

GoTipe Cloud keeps the model keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`GOOGLE_AI_API_KEY`) on the server and exposes one endpoint, `POST /v1/ai/complete`. Call it
with the user's token; the token needs the `ai:use` scope (see
[Authentication](/docs/cloud/auth)).

| Field | Type | Description |
| --- | --- | --- |
| `command` | `string` | Required: `complete`, `rewrite`, `summarize`, `translate`, `fix_grammar` or `change_tone`. |
| `prompt` | `string` | The instruction. `prompt` or `context` is required. |
| `context` | JSON | The text the model works on. |
| `document_id` | `string` | Optional. The user needs viewer access to it. |
| `provider` | `string` | `openai`, `anthropic` or `google`. Default: `AI_DEFAULT_PROVIDER` (`openai`). |
| `model` | `string` | Default: `AI_DEFAULT_MODEL` (`gpt-4o-mini`). Required with a provider other than the default. |
| `max_tokens` | `number` | 1 to `AI_MAX_TOKENS` (4096 by default). |
| `temperature` | `number` | 0 to 2. |
| `stream` | `boolean` | `true` for server-sent events. |

With `stream: false` the answer is `{ content, model, provider, usage }`. With
`stream: true` it is a `text/event-stream` of a `start` event, `content` events with
`{ text }` and a final `done` event with `{ usage }`; a failure after the start arrives as an
`error` event with `{ code, message }`. Errors before the stream are JSON
`{ error: { code, message } }`: 400 `VALIDATION_ERROR`, 402 `QUOTA_EXCEEDED` when the
plan's monthly AI requests are used up, 429 `RATE_LIMITED` above `RATE_LIMIT_AI` (60 per
minute by default), 503 `SERVICE_UNAVAILABLE` when no key is configured or the model fails.

```ts title="cloud-ai-provider.ts"
import type { AiContext, AiProvider } from "@gotipe/ai";
import { createId } from "@gotipe/core";

const textOf = (context: AiContext): string =>
  context.selectedText ??
  context.fullText ??
  (context.surroundingBlocks ?? [])
    .map((block) =>
      typeof block.content === "string"
        ? block.content
        : (block.content ?? []).map((span) => span.text).join(""),
    )
    .join("\n");

export function cloudAiProvider(apiUrl: string, getToken: () => Promise<string>): AiProvider {
  async function* complete(command: string, prompt: string, context: AiContext) {
    const response = await fetch(`${apiUrl}/v1/ai/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ command, prompt, context: textOf(context), stream: true }),
      signal: context.signal,
    });
    if (!response.ok || !response.body) {
      const failure = await response.json().catch(() => null);
      throw new Error(failure?.error?.message ?? `AI request failed (${response.status})`);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("The AI stream ended early");
      buffer += value;
      for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
        const message = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = /^event: (.+)$/m.exec(message)?.[1];
        const data = JSON.parse(/^data: (.+)$/m.exec(message)?.[1] ?? "{}");
        if (event === "content") yield String(data.text);
        else if (event === "error") throw new Error(data.message);
        else if (event === "done") return;
      }
    }
  }
  const collect = async (chunks: AsyncIterable<string>) => {
    let text = "";
    for await (const chunk of chunks) text += chunk;
    return text;
  };
  return {
    name: "gotipe-cloud",
    generateCompletion: (context) => complete("complete", "", context),
    streamRewrite: (text, context) =>
      complete("rewrite", "Improve the text.", { ...context, selectedText: text }),
    generateParagraph: (prompt, context) =>
      complete("complete", `Write one new paragraph: ${prompt}`, context),
    executeCommand: (command, context) => collect(complete("rewrite", command, context)),
    generateSuggestions: async (prompt, context) => [
      {
        id: createId(),
        type: "rewrite",
        content: await collect(complete("rewrite", prompt, context)),
        confidence: 1,
      },
    ],
  };
}
```

The endpoint returns text only. Proofreading and review need structured results, so this
provider leaves them out; serve them from your own backend if you need them.

## Limitations

- `@gotipe/ai` has no vendor SDK and no tool or function calling.
- Requests to GoTipe Cloud count against the plan's AI quota. A model call times out after
  two minutes, and a streamed answer cannot be replayed with an idempotency key.
- The PII check of the manager runs in the browser before your provider is called. Apply
  your own server-side policy as well.

## Related

- [AI](/docs/ai/overview): commands, context and cancellation.
- [AI UI](/docs/ai/ui): where the results appear.
- [Authentication](/docs/cloud/auth) and [REST API](/docs/cloud/rest-api) of GoTipe Cloud.
- [Security](/docs/resources/security).
