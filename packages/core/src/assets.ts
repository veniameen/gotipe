import { GoTipeError } from "./error";
import type { EditorHost, GoTipeEditor } from "./types/editor";

export const INLINE_ASSET_LIMIT = 10 * 1024 * 1024;
export const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export interface SavedAsset {
  src: string;
  name: string;
}
export type StoredAsset = Parameters<NonNullable<EditorHost["discardAsset"]>>[0];

/**
 * `host` whose `saveAsset` also lists in `stored` each file it stored. The host stays the
 * prototype, so its own methods and getters keep their `this`.
 */
export function recordingHost(host: EditorHost, stored: StoredAsset[]): EditorHost {
  if (!host.saveAsset) return host;
  const recording: EditorHost = Object.create(host);
  recording.saveAsset = async (file, info) => {
    const saved = await host.saveAsset!(file, info);
    if (saved?.src) stored.push({ src: saved.src, name: saved.name ?? info.name, kind: info.kind });
    return saved;
  };
  return recording;
}

/** True when a block of `blocks`, at any depth, shows `src` (an image's or a file's). */
function usesSource(
  blocks: readonly { attrs: Record<string, unknown>; children: readonly unknown[] }[],
  src: string,
): boolean {
  return blocks.some(
    (block) =>
      block.attrs.src === src ||
      block.attrs.url === src ||
      usesSource(block.children as typeof blocks, src),
  );
}

/**
 * Tells the host about a file its `saveAsset` stored that the editor then did not insert. A
 * source the document shows is not given up: a host may return the same `src` for the same
 * file (by name or by content), and another block may hold it.
 */
export function discardSavedAsset(
  editor: Pick<GoTipeEditor, "host" | "reportError" | "getViewState">,
  asset: StoredAsset,
): void {
  const { saveAsset, discardAsset } = editor.host;
  if (!saveAsset || !discardAsset) return;
  if (usesSource(editor.getViewState().blocks, asset.src)) return;
  try {
    discardAsset.call(editor.host, asset);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    editor.reportError(
      new GoTipeError("ASSET_SAVE_FAILED", message, { src: asset.src, cause: error }),
    );
  }
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
  const info = { kind, name, mediaType: file.type, size: file.size };
  let saved: Awaited<ReturnType<NonNullable<EditorHost["saveAsset"]>>>;
  try {
    saved = await host.saveAsset(file, info);
  } catch (error) {
    // a host failure is a failed save, whatever it threw: never a clipboard or paste error
    if (error instanceof GoTipeError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new GoTipeError("ASSET_SAVE_FAILED", message, { ...info, cause: error });
  }
  if (!saved?.src?.trim())
    throw new GoTipeError("ASSET_SAVE_FAILED", "The host returned no asset path");
  if (/^(?:javascript|vbscript):/i.test(saved.src.replace(/\s/g, ""))) {
    throw new GoTipeError("ASSET_SAVE_FAILED", "The host returned an unsafe asset URL");
  }
  return { src: saved.src, name: saved.name ?? name };
}
