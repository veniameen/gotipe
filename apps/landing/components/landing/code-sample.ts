/**
 * The samples of the dark panel, one per tab: the real public API, as the quick start
 * (docs-site/getting-started/quick-start.md) writes it — `@gotipe/block-editor`,
 * `@gotipe/core/presets`, `@gotipe/react`, `@gotipe/vue`, the theme's CSS entries. They are
 * highlighted at build time by the docs' highlighter (lib/docs/highlight.ts), in the library's
 * syntax colours.
 */
export interface CodeSample {
  /** The tab's name. */
  tab: string;
  file: string;
  /** The highlighter's language. */
  language: "tsx" | "vue";
  text: string;
}

export const SAMPLES: CodeSample[] = [
  {
    tab: "React",
    file: "Notes.tsx",
    language: "tsx",
    text: `import { BlockEditor } from "@gotipe/block-editor";
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
`,
  },
  {
    tab: "Markdown",
    file: "Page.tsx",
    language: "tsx",
    text: `import { PageEditor } from "@gotipe/block-editor";
import { useState } from "react";
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";

export function Page() {
  const [markdown, setMarkdown] = useState("# Release notes\\n");
  return (
    <>
      <PageEditor markdown={markdown} onChange={setMarkdown} />
      <pre>{markdown}</pre>
    </>
  );
}
`,
  },
  {
    tab: "Vue",
    file: "Editor.vue",
    language: "vue",
    text: `<script setup lang="ts">
import { DefaultPreset } from "@gotipe/core/presets";
import { EditorContent, useEditor } from "@gotipe/vue";

const editor = useEditor({
  extensions: [DefaultPreset],
  engine: "js",
});
</script>

<template>
  <EditorContent :editor="editor" aria-label="Document" />
</template>
`,
  },
];
