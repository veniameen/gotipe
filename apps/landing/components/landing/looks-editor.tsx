"use client";

import { BlockEditor, FixedToolbar, PageHead, pageExtensions } from "@gotipe/block-editor";
import { FontFamily, FontSize, InvisibleCharacters, TextAlign } from "@gotipe/core/extensions";
import { parseMarkdown } from "@gotipe/markdown";
import { useEditor } from "@gotipe/react";
import type { ThemePreset } from "@gotipe/theme";
import { useState } from "react";
import { LOOK_MARKDOWN, LOOK_TITLE } from "./demo-content";

/**
 * The page under the look switcher: one BlockEditor, its `view` prop set by the list. The modern
 * view stands under the library's fixed toolbar (Atlas frame 31), with the font, size and ¶.
 */
export default function LooksEditor({ view }: { view: ThemePreset }) {
  const editor = useEditor({
    extensions: [...pageExtensions(), TextAlign, FontFamily, FontSize, InvisibleCharacters],
    content: parseMarkdown(LOOK_MARKDOWN).doc,
    engine: "js",
  });
  const [title, setTitle] = useState(LOOK_TITLE);
  // the views with a page head draw the title above the document, as in the playground
  const header =
    view === "notion" || view === "docs" ? (
      <PageHead
        title={title}
        onTitleChange={setTitle}
        onTitleEnter={() => editor?.focus("start")}
      />
    ) : undefined;
  return (
    <>
      {view === "modern" && editor ? <FixedToolbar editor={editor} /> : null}
      <BlockEditor
        editor={editor}
        view={view}
        header={header}
        showAiCommandBar={false}
        showThemeToggle={false}
        ariaLabel={`${LOOK_TITLE}, ${view} view`}
      />
    </>
  );
}
