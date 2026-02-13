import { type CreateEditorOptions, type GoTipeEditor, createEditor } from "@gotipe/core";
import { useEffect, useRef, useState } from "react";

export interface UseEditorOptions extends CreateEditorOptions {}

export function useEditor(options: UseEditorOptions): GoTipeEditor | null {
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let destroyed = false;
    let instance: GoTipeEditor | null = null;

    createEditor(optionsRef.current)
      .then((ed) => {
        if (destroyed) {
          ed.destroy();
          return;
        }
        instance = ed;
        setEditor(ed);
      })
      .catch((err) => {
        console.error("GoTipe: Failed to create editor:", err);
      });

    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, []);

  return editor;
}
