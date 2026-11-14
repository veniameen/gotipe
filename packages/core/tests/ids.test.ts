import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../src";
import { createEditor } from "../src/js";
import { applyPolyfills } from "../src/polyfills";
import { DefaultPreset } from "../src/presets";

/** The platform crypto, kept before a test stubs the global. */
const platform = globalThis.crypto;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A page over plain HTTP: `crypto.getRandomValues()` without `crypto.randomUUID()`. */
function insecureContext() {
  const getRandomValues = vi.fn(<T extends ArrayBufferView>(array: T) =>
    platform.getRandomValues(array as never),
  );
  vi.stubGlobal("crypto", { getRandomValues });
  return getRandomValues;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createId (D-85)", () => {
  it("uses crypto.randomUUID where the page has it", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555");
    vi.stubGlobal("crypto", { randomUUID, getRandomValues: vi.fn() });
    expect(createId()).toBe("11111111-2222-4333-8444-555555555555");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("makes a UUID v4 from getRandomValues on a page without randomUUID", () => {
    const getRandomValues = insecureContext();
    const ids = new Set(Array.from({ length: 200 }, () => createId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(getRandomValues).toHaveBeenCalledTimes(200);
  });

  it("sets the version and variant bits whatever the random bytes are", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: <T extends ArrayBufferView>(array: T) => {
        new Uint8Array(array.buffer).fill(0xff);
        return array;
      },
    });
    expect(createId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("fails loudly instead of making weak IDs when the platform has no crypto", () => {
    vi.stubGlobal("crypto", undefined);
    expect(() => createId()).toThrow(/getRandomValues/);
  });

  it("creates an editor and new blocks on a page without randomUUID", async () => {
    insecureContext();
    const editor = await createEditor({
      extensions: [DefaultPreset],
      content: "<p>one</p><p>two</p>",
    });
    try {
      const ids = editor.getJSON().blocks.map((block) => block.id);
      expect(ids).toHaveLength(2);
      for (const id of ids) expect(id).toMatch(UUID_V4);
      // without the global the editor installed: commands do not depend on `applyPolyfills`
      const getRandomValues = insecureContext();
      const at = { blockId: ids[0]!, offset: 0 };
      editor.setSelection({ anchor: at, head: at });
      expect(editor.chain().insertBlockAfter("paragraph").run()).toBe(true);
      expect(editor.getJSON().blocks).toHaveLength(3);
      expect(editor.getJSON().blocks[1]!.id).toMatch(UUID_V4);
      expect(getRandomValues).toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });

  it("keeps the global polyfill for host code, built on the same helper", () => {
    insecureContext();
    applyPolyfills();
    expect(globalThis.crypto.randomUUID()).toMatch(UUID_V4);
  });
});
