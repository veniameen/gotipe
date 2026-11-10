import type { ImageResolver } from "./types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Prepare a private export snapshot; the live editor document is never mutated. */
export async function prepareImages<T extends object>(
  document: T,
  resolveImage?: ImageResolver,
): Promise<T> {
  const snapshot = structuredClone(document);
  const resolved = new Map<string, string>();
  let totalBytes = 0;
  async function visit(blocks: unknown): Promise<void> {
    if (!Array.isArray(blocks)) throw new Error("Export document blocks must be an array");
    for (const block of blocks) {
      if (!record(block) || !record(block.attrs))
        throw new Error("Export block attributes must be an object");
      if (block.type === "image") {
        const source = block.attrs.src;
        if (typeof source !== "string" || source === "") throw new Error("Image source is missing");
        let embedded = resolved.get(source);
        if (embedded === undefined) {
          if (source.startsWith("data:")) {
            embedded = source;
          } else {
            if (!resolveImage) {
              throw new Error("PDF/DOCX export requires resolveImage for image URLs");
            }
            const value = await resolveImage(source);
            const bytes =
              value instanceof Uint8Array ? value : new Uint8Array(await value.arrayBuffer());
            if (bytes.byteLength > 8 * 1024 * 1024)
              throw new Error("Image exceeds the 8 MiB export limit");
            const chunks: string[] = [];
            for (let i = 0; i < bytes.length; i += 8192) {
              chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
            }
            embedded = `data:application/octet-stream;base64,${btoa(chunks.join(""))}`;
          }
          if (embedded.length > 12 * 1024 * 1024)
            throw new Error("Embedded image exceeds the export limit");
          resolved.set(source, embedded);
        }
        totalBytes += embedded.length;
        if (totalBytes > 32 * 1024 * 1024)
          throw new Error("Images exceed the document export limit");
        block.attrs.src = embedded;
      }
      await visit(block.children);
    }
  }
  if (!record(snapshot)) throw new Error("Export document must be an object");
  await visit(snapshot.blocks);
  return snapshot;
}
