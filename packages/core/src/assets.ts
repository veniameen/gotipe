import { GoTipeError } from "./error";
import type { EditorHost } from "./types/editor";

export const INLINE_ASSET_LIMIT = 10 * 1024 * 1024;
export const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export interface SavedAsset {
  src: string;
  name: string;
}

/** A durable standalone asset, serialized with the document instead of a session blob URL. */
export async function encodeInlineAsset(file: Blob): Promise<string> {
  if (file.size > INLINE_ASSET_LIMIT) {
    throw new GoTipeError("ASSET_TOO_LARGE", "Files above 10 MiB need host asset storage");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  }
  const mime = /^[\w.+-]+\/[\w.+-]+$/.test(file.type) ? file.type : "application/octet-stream";
  return `data:${mime};base64,${btoa(binary)}`;
}

/** Storage is host-owned when supplied; otherwise small files travel with the document. */
export async function saveAsset(
  host: Pick<EditorHost, "saveAsset">,
  file: Blob,
  kind: "image" | "file",
): Promise<SavedAsset> {
  const name = typeof File !== "undefined" && file instanceof File && file.name ? file.name : kind;
  if (kind === "image" && !IMAGE_MEDIA_TYPES.includes(file.type.toLowerCase())) {
    throw new GoTipeError("ASSET_UNSUPPORTED", "Choose a PNG, JPEG, GIF or WebP image");
  }
  if (!host.saveAsset) return { src: await encodeInlineAsset(file), name };
  const saved = await host.saveAsset(file, { kind, name, mediaType: file.type, size: file.size });
  if (!saved?.src?.trim())
    throw new GoTipeError("ASSET_SAVE_FAILED", "The host returned no asset path");
  if (/^(?:javascript|vbscript):/i.test(saved.src.replace(/\s/g, ""))) {
    throw new GoTipeError("ASSET_SAVE_FAILED", "The host returned an unsafe asset URL");
  }
  return { src: saved.src, name: saved.name ?? name };
}
