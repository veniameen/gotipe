import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownSession } from "./markdown-session";

/** The platform crypto, kept before a test stubs the global. */
const platform = globalThis.crypto;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MarkdownSession on a page served over plain HTTP (D-28, D-85)", () => {
  it("adds the synthetic title of a file without one, without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (array: Uint8Array) => platform.getRandomValues(array),
    });
    const session = new MarkdownSession({ ensureTitle: true });
    const doc = session.parse("Body text\n");
    const title = doc.blocks[0]!;
    expect(title.type).toBe("heading");
    expect(title.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(session.isSyntheticTitle(title.id)).toBe(true);
    expect(doc.blocks[1]!.type).toBe("paragraph");
  });
});
