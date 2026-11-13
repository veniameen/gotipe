import { ExportError } from "./errors";
import type { ImageResolver } from "./types";

/** The editor keeps files up to 10 MiB inside the document; export accepts the same size. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Decoded image data one export may embed; repeated sources count once per occurrence. */
export const MAX_DOCUMENT_IMAGE_BYTES = 64 * 1024 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bytes a `data:` URL decodes to; base64 ignores ASCII whitespace and padding as browsers do. */
function decodedLength(source: string): number {
  const comma = source.indexOf(",");
  const header = source.slice(0, comma < 0 ? source.length : comma);
  const payload = comma < 0 ? "" : source.slice(comma + 1);
  if (!/;base64$/i.test(header)) return payload.length;
  const symbols = payload.replace(/[\t\n\f\r ]+/g, "").replace(/={1,2}$/, "");
  return Math.floor((symbols.length * 3) / 4);
}

function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

/** Prepare a private export snapshot; the live editor document is never mutated. */
export async function prepareImages<T extends object>(
  document: T,
  resolveImage?: ImageResolver,
): Promise<T> {
  const snapshot = structuredClone(document);
  const resolved = new Map<string, { src: string; bytes: number }>();
  let totalBytes = 0;
  async function visit(blocks: unknown): Promise<void> {
    if (!Array.isArray(blocks)) throw new Error("Export document blocks must be an array");
    for (const block of blocks) {
      if (!record(block) || !record(block.attrs))
        throw new Error("Export block attributes must be an object");
      const source = typeof block.attrs.src === "string" ? block.attrs.src.trim() : "";
      // An image placeholder without a source exports as nothing (or its caption).
      if (block.type === "image" && source !== "") {
        let embedded = resolved.get(source);
        if (embedded === undefined) {
          if (/^data:/i.test(source)) {
            embedded = { src: source, bytes: decodedLength(source) };
          } else {
            if (!resolveImage) {
              throw new ExportError(
                "IMAGE_ERROR",
                "PDF/DOCX export requires resolveImage for image URLs",
              );
            }
            const value = await resolveImage(source);
            const bytes =
              value instanceof Uint8Array ? value : new Uint8Array(await value.arrayBuffer());
            embedded = {
              src: `data:application/octet-stream;base64,${base64(bytes)}`,
              bytes: bytes.byteLength,
            };
          }
          if (embedded.bytes > MAX_IMAGE_BYTES)
            throw new ExportError("IMAGE_ERROR", "Image exceeds the 10 MiB export limit");
          resolved.set(source, embedded);
        }
        totalBytes += embedded.bytes;
        if (totalBytes > MAX_DOCUMENT_IMAGE_BYTES)
          throw new ExportError("IMAGE_ERROR", "Images exceed the 64 MiB document export limit");
        block.attrs.src = embedded.src;
      }
      await visit(block.children);
    }
  }
  if (!record(snapshot)) throw new Error("Export document must be an object");
  await visit(snapshot.blocks);
  return snapshot;
}
