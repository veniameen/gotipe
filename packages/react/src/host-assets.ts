import { GoTipeError, type GoTipeEditor } from "@gotipe/core";
import { useEffect, useState } from "react";

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Resolves a document asset path for display through `host.resolveAsset`
 * (e.g. `assets/x.png` → `data:image/png;base64,…`). Absolute http(s), data:
 * and blob: URLs are shown as they are when the host has no resolver.
 */
export function useResolvedAsset(editor: GoTipeEditor, src: string): {
  url: string | null;
  failed: boolean;
} {
  const resolver = editor.host.resolveAsset;
  const [state, setState] = useState<{ src: string; url: string | null; failed: boolean }>(() => ({
    src,
    url: resolver ? null : src || null,
    failed: false,
  }));

  useEffect(() => {
    if (!src) {
      setState({ src, url: null, failed: false });
      return;
    }
    if (!resolver) {
      setState({ src, url: src, failed: false });
      return;
    }
    let cancelled = false;
    setState((prev) => (prev.src === src ? prev : { src, url: null, failed: false }));
    Promise.resolve()
      .then(() => resolver(src))
      .then((url) => {
        if (cancelled) return;
        setState({ src, url: url ?? null, failed: !url });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ src, url: null, failed: true });
        editor.reportError(
          new GoTipeError("ASSET_RESOLVE_FAILED", e instanceof Error ? e.message : String(e), { src }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [editor, resolver, src]);

  return state.src === src ? { url: state.url, failed: state.failed } : { url: null, failed: false };
}

/**
 * Stores a file through `host.saveAsset` and returns the document path.
 * Without a host the file is shown through an object URL (standalone mode).
 * Failures are reported as `error` events and resolve to `null`.
 */
export async function saveAssetWithHost(
  editor: GoTipeEditor,
  file: File | Blob,
  kind: "image" | "file",
): Promise<{ src: string; name: string } | null> {
  const name = file instanceof File && file.name ? file.name : kind === "image" ? "image" : "file";
  const save = editor.host.saveAsset;
  if (!save) {
    return { src: URL.createObjectURL(file), name };
  }
  try {
    const saved = await save(file, { kind, name, mediaType: file.type, size: file.size });
    if (!saved?.src) throw new Error("The host returned no path");
    return { src: saved.src, name: saved.name ?? name };
  } catch (e) {
    editor.reportError(
      e instanceof GoTipeError
        ? e
        : new GoTipeError("ASSET_SAVE_FAILED", e instanceof Error ? e.message : String(e), {
            name,
            kind,
            mediaType: file.type,
            size: file.size,
          }),
    );
    return null;
  }
}

/** True for http(s)/data/blob URLs; false for document paths like `assets/x.png`. */
export function isAbsoluteUrl(src: string): boolean {
  return SCHEME.test(src);
}
