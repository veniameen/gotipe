/**
 * The React sample of the dark panel: the real public API (`@gotipe/block-editor`,
 * `@gotipe/core/presets`, `@gotipe/react`, the theme's CSS entries). It is highlighted at build
 * time by the docs' highlighter (lib/docs/highlight.ts), in the library's syntax colours.
 */
export const SAMPLE_FILE = "Notes.tsx";

export const SAMPLE_TEXT = `import { BlockEditor } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import "@gotipe/theme/theme.css";
import "@gotipe/theme/base.css";

export function Notes({ content, save }) {
  const editor = useEditor({
    extensions: [FullPreset],
    content,
    onUpdate: ({ editor }) => save(editor.getJSON()),
  });
  return <BlockEditor editor={editor} />;
}
`;
