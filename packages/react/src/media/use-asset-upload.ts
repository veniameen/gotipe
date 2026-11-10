import { type BlockView, type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveAssetWithHost } from "../host-assets";

function find(blocks: BlockView[], id: string): BlockView | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const nested = find(block.children, id);
    if (nested) return nested;
  }
}

/** A late upload cannot recreate a deleted block or replace a newer chosen source. */
export function useAssetUpload(
  editor: GoTipeEditor,
  blockId: string,
  kind: "image" | "file",
  apply: (saved: { src: string; name: string }, file: File) => void,
) {
  const request = useRef(0);
  const mounted = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  const upload = useCallback(
    async (file: File, expectedSource?: string) => {
      if (!mounted.current || editor.isDestroyed || !editor.isEditable) return;
      const before = find(editor.getViewState().blocks, blockId);
      if (!before) return;
      const sourceKey = kind === "image" ? "src" : "url";
      const previousSource = before.attrs[sourceKey];
      if (expectedSource !== undefined && previousSource !== expectedSource) {
        setError("The image changed. Reopen the dialog before editing it.");
        return;
      }
      const generation = ++request.current;
      setPending(true);
      setError(null);
      try {
        const saved = await saveAssetWithHost(editor, file, kind);
        if (
          !mounted.current ||
          generation !== request.current ||
          editor.isDestroyed ||
          !editor.isEditable
        )
          return;
        const current = find(editor.getViewState().blocks, blockId);
        if (!current || current.attrs[sourceKey] !== previousSource) return;
        if (saved) apply(saved, file);
        else setError("Upload failed. Please try again.");
      } catch (error) {
        if (mounted.current && generation === request.current && !editor.isDestroyed) {
          const failure =
            error instanceof GoTipeError
              ? error
              : new GoTipeError(
                  "ASSET_SAVE_FAILED",
                  error instanceof Error ? error.message : "Could not insert the uploaded asset",
                );
          setError(failure.message);
          editor.reportError(failure);
        }
      } finally {
        if (mounted.current && generation === request.current) setPending(false);
      }
    },
    [editor, blockId, kind, apply],
  );
  return { upload, pending, error };
}
