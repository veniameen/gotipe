import type { Document } from "@gotipe/core";
import { describe, expect, it, vi } from "vitest";
import { prepareImages } from "./assets";

function document(): Document {
  return {
    version: 1,
    blocks: [
      {
        id: "image",
        type: "image",
        attrs: { src: "https://host.test/image.png" },
        content: null,
        children: [],
      },
    ],
  };
}
describe("export assets", () => {
  it("requires explicit host access for image URLs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(prepareImages(document())).rejects.toThrow("resolveImage");
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it("resolves repeated nested assets once without mutating the editor", async () => {
    const doc = document();
    doc.blocks.push({
      id: "quote",
      type: "blockquote",
      attrs: {},
      content: [],
      children: [{ ...doc.blocks[0]!, id: "nested" }],
    });
    const resolver = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const result = await prepareImages(doc, resolver);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(result.blocks[0]!.attrs.src).toBe("data:application/octet-stream;base64,AQID");
    expect(result.blocks[1]!.children[0]!.attrs.src).toBe(result.blocks[0]!.attrs.src);
    expect(doc.blocks[0]!.attrs.src).toBe("https://host.test/image.png");
  });
  it("propagates resolver failure and enforces decoded asset limits", async () => {
    await expect(
      prepareImages(document(), async () => {
        throw new Error("asset unavailable");
      }),
    ).rejects.toThrow("asset unavailable");
    await expect(
      prepareImages(document(), async () => new Uint8Array(8 * 1024 * 1024 + 1)),
    ).rejects.toThrow("8 MiB");
  });
});
