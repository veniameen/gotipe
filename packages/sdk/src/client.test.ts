import { afterEach, describe, expect, it, vi } from "vitest";
import { GoTipeClient } from "./client";
import { GoTipeApiError } from "./transport";

const client = () => new GoTipeClient({ baseUrl: "https://cloud.example/", apiKey: "gt_test_key" });
function respond(body: unknown, status = 200) {
  const fetch = vi
    .fn()
    .mockImplementation(
      async () => new Response(status === 204 ? null : JSON.stringify(body), { status }),
    );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Cloud SDK contracts", () => {
  it("uses bearer API keys and limit/offset pagination without rewriting content", async () => {
    const fetch = respond({
      data: [{ id: "doc", size_bytes: 12, created_at: "today", content: { custom_key: "keep" } }],
      total: 12,
      limit: 5,
      offset: 5,
    });
    const result = await client().listDocuments(2, 5);
    expect(fetch).toHaveBeenCalledWith(
      "https://cloud.example/v1/documents?limit=5&offset=5",
      expect.objectContaining({
        headers: { "Content-Type": "application/json", Authorization: "Bearer gt_test_key" },
      }),
    );
    expect(result).toMatchObject({
      page: 2,
      perPage: 5,
      hasMore: true,
      data: [{ sizeBytes: 12, createdAt: "today", content: { custom_key: "keep" } }],
    });
  });
  it("deletes successfully on a bodyless 204 response and encodes IDs", async () => {
    const fetch = respond(null, 204);
    await expect(client().deleteDocument("id/with space")).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]?.[0]).toBe("https://cloud.example/v1/documents/id%2Fwith%20space");
  });
  it("unwraps comment pages and derives resolved state", async () => {
    const fetch = respond({
      data: [{ id: "a", resolved_at: "today", block_id: "b" }, { id: "c" }],
      has_more: true,
      next_cursor: "after-c",
    });
    expect(
      await client().listComments("doc", { includeResolved: true, limit: 2, cursor: "after/a" }),
    ).toEqual({
      data: [
        { id: "a", resolvedAt: "today", blockId: "b", resolved: true },
        { id: "c", resolved: false },
      ],
      hasMore: true,
      nextCursor: "after-c",
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://cloud.example/v1/documents/doc/comments?include_resolved=true&limit=2&cursor=after%2Fa",
    );
  });
  it("reads every page by passing nextCursor back", async () => {
    const fetch = respond({});
    fetch
      .mockResolvedValueOnce(
        new Response('{"data":[{"id":"v2","size_bytes":2}],"has_more":true,"next_cursor":"c1"}'),
      )
      .mockResolvedValueOnce(
        new Response('{"data":[{"id":"v1","size_bytes":1}],"has_more":false}'),
      );
    const versions = [];
    let cursor: string | undefined;
    do {
      const page = await client().listVersions("doc", { cursor });
      versions.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);
    expect(versions).toEqual([
      { id: "v2", sizeBytes: 2 },
      { id: "v1", sizeBytes: 1 },
    ]);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "https://cloud.example/v1/documents/doc/versions",
      "https://cloud.example/v1/documents/doc/versions?cursor=c1",
    ]);
  });
  it("rejects a page that has more items but no cursor to them", async () => {
    respond({ data: [], has_more: true });
    await expect(client().listVersions("doc")).rejects.toMatchObject({
      name: "GoTipeApiError",
      code: "INVALID_RESPONSE",
    });
  });
  it("treats a list without has_more as the last page", async () => {
    respond({ data: [{ id: "c" }], next_cursor: "ignored" });
    expect(await client().listComments("doc")).toEqual({
      data: [{ id: "c", resolved: false }],
      hasMore: false,
    });
  });
  it("sends comment anchors with server field names", async () => {
    const fetch = respond({ id: "comment", block_id: "block" }, 201);
    await client().addComment("doc", { blockId: "block", content: "Hello", from: 2, to: 7 });
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({
      block_id: "block",
      content: "Hello",
      anchor_type: "inline",
      from: 2,
      to: 7,
    });
  });
  it("returns the collaboration state with its generation and untouched updates", async () => {
    const state = {
      baseline: { version: 1, blocks: [] },
      updates: [
        {
          protocol: "gotipe.crdt/2",
          operations: [
            { id: { lamport: 1, peer_id: "a" }, change: { DeleteBlock: { block_id: "b" } } },
          ],
        },
      ],
      generation: "6c0d6e3f5a1b4c2d8e9f0a1b2c3d4e5f",
    };
    respond({ id: "doc", size_bytes: 2, collaboration_state: state });
    const document = await client().getDocument("doc");
    expect(document.collaborationState).toEqual(state);
    expect(document.collaborationState?.generation).toBe(state.generation);
  });
  it("uses the top-level export endpoints", async () => {
    const fetch = respond({ id: "job", document_id: "doc", created_at: "today" }, 202);
    expect(await client().createExportJob("doc", "pdf")).toMatchObject({
      documentId: "doc",
      createdAt: "today",
    });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://cloud.example/v1/exports");
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({
      document_id: "doc",
      format: "pdf",
    });
    await client().getExportJob("doc", "job");
    expect(fetch.mock.calls[1]?.[0]).toBe("https://cloud.example/v1/exports/job");
  });
  it("uses the configured AI proxy request contract", async () => {
    const fetch = respond({ content: "text" });
    await client().aiGenerate("doc", { prompt: "rewrite", mode: "rewrite", maxTokens: 200 });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://cloud.example/v1/ai/complete");
    expect(JSON.parse(fetch.mock.calls[0]?.[1].body)).toEqual({
      document_id: "doc",
      prompt: "rewrite",
      command: "rewrite",
      max_tokens: 200,
      stream: false,
    });
  });
  it("requests a document after restoring the server's status response", async () => {
    const fetch = respond({ status: "restored" });
    fetch
      .mockResolvedValueOnce(new Response('{"status":"restored"}'))
      .mockResolvedValueOnce(new Response('{"id":"doc","size_bytes":4}'));
    expect(await client().restoreVersion("doc", "version")).toMatchObject({
      id: "doc",
      sizeBytes: 4,
    });
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "https://cloud.example/v1/documents/doc/versions/version/restore",
      "https://cloud.example/v1/documents/doc",
    ]);
  });
  it("throws an Error with status, code and details", async () => {
    respond({ error: { code: "NOT_FOUND", message: "Missing", details: { id: "doc" } } }, 404);
    await expect(client().getDocument("doc")).rejects.toMatchObject({
      name: "GoTipeApiError",
      code: "NOT_FOUND",
      message: "Missing",
      status: 404,
      details: { id: "doc" },
    });
    await expect(client().getDocument("doc")).rejects.toBeInstanceOf(GoTipeApiError);
  });
  it("normalizes non-JSON proxy errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 502 })));
    await expect(client().getDocument("doc")).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 502,
    });
  });
  it("aborts requests at the configured deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const request = new GoTipeClient({ baseUrl: "https://cloud.example", timeout: 20 }).getDocument(
      "doc",
    );
    const assertion = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(21);
    await assertion;
  });
  it("requires valid pagination before making requests", async () => {
    const fetch = respond({});
    await expect(client().listDocuments(0)).rejects.toThrow(RangeError);
    await expect(client().listDocuments(1, 101)).rejects.toThrow(RangeError);
    await expect(client().listComments("doc", { limit: 0 })).rejects.toThrow(RangeError);
    await expect(client().listVersions("doc", { limit: 1.5 })).rejects.toThrow(RangeError);
    await expect(client().listVersions("doc", { limit: 101 })).rejects.toThrow(RangeError);
    // The former listComments(docId, includeResolved) from JavaScript.
    await expect(client().listComments("doc", true as never)).rejects.toThrow(TypeError);
    await expect(client().listVersions("doc", null as never)).rejects.toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
