import type { Document } from "@gotipe/core";
import { describe, expect, it, vi } from "vitest";
import { MAX_DOCUMENT_IMAGE_BYTES, MAX_IMAGE_BYTES, prepareImages } from "./assets";
import { ExportError } from "./errors";

function image(src: string | null, id = "image"): Document["blocks"][number] {
  const attrs: Record<string, string> = { alt: "", caption: "" };
  if (src !== null) attrs.src = src;
  return { id, type: "image", attrs, content: null, children: [] };
}
function document(...blocks: Document["blocks"]): Document {
  return { version: 1, blocks: blocks.length ? blocks : [image("https://host.test/image.png")] };
}
/** A base64 `data:` URL that decodes to exactly `bytes` bytes. */
function dataUrl(bytes: number, header = "data:image/png;base64,"): string {
  const padding = bytes % 3 === 0 ? "" : bytes % 3 === 1 ? "==" : "=";
  return `${header}${"A".repeat(Math.ceil(bytes / 3) * 4 - padding.length)}${padding}`;
}

describe("export assets", () => {
  it("requires explicit host access for image URLs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const error = await prepareImages(document()).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ExportError);
    expect(error).toMatchObject({ code: "IMAGE_ERROR", message: /resolveImage/ });
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

  it("leaves the placeholders the editor inserts before an upload to the renderer", async () => {
    const resolver = vi.fn(async () => new Uint8Array([1]));
    const doc = document(image(""), image("   ", "blank"), image(null, "missing"));
    const result = await prepareImages(doc, resolver);
    expect(resolver).not.toHaveBeenCalled();
    expect(result).toEqual(doc);
    await expect(prepareImages(doc)).resolves.toEqual(doc);
  });

  it("passes inline WebP and case-insensitive data URLs through without a resolver", async () => {
    const webp = "DATA:image/webp;BASE64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
    const result = await prepareImages(document(image(` ${webp} `)));
    expect(result.blocks[0]!.attrs.src).toBe(webp);
  });

  it("accepts the editor's largest inline upload and rejects anything larger", async () => {
    const largest = dataUrl(MAX_IMAGE_BYTES);
    await expect(prepareImages(document(image(largest)))).resolves.toBeDefined();
    await expect(prepareImages(document(image(dataUrl(MAX_IMAGE_BYTES + 1))))).rejects.toThrow(
      "10 MiB",
    );
    const resolved = await prepareImages(document(), async () => new Uint8Array(MAX_IMAGE_BYTES));
    expect(resolved.blocks[0]!.attrs.src).toMatch(/^data:application\/octet-stream;base64,/);
    await expect(
      prepareImages(document(), async () => new Uint8Array(MAX_IMAGE_BYTES + 1)),
    ).rejects.toMatchObject({ code: "IMAGE_ERROR", message: /10 MiB/ });
  });

  it("bounds the decoded image data of one export", async () => {
    const count = Math.floor(MAX_DOCUMENT_IMAGE_BYTES / MAX_IMAGE_BYTES);
    const blocks = Array.from({ length: count + 1 }, (_, index) =>
      image(dataUrl(MAX_IMAGE_BYTES - index), `image-${index}`),
    );
    await expect(prepareImages(document(...blocks.slice(0, count)))).resolves.toBeDefined();
    await expect(prepareImages(document(...blocks))).rejects.toThrow("64 MiB");
  });

  it("propagates the host's resolver failure unchanged", async () => {
    const failure = new Error("asset unavailable");
    await expect(
      prepareImages(document(), async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});
