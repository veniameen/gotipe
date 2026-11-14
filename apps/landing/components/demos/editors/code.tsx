import { BlockEditor } from "@gotipe/block-editor";
import {
  codeLanguageAliases,
  codeLanguages,
  createShikiHighlighter,
  gotipeCodeThemeLoader,
} from "@gotipe/block-editor/shiki";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { documentOf } from "../frame/content";
import { DemoScroll } from "../frame/tools";
import "../frame/editor-styles";

/** Shiki with the GoTipe code theme: grammars load on first use, colours follow the theme. */
const highlight = createShikiHighlighter({
  langs: codeLanguages,
  aliases: codeLanguageAliases,
  themes: { light: gotipeCodeThemeLoader, dark: gotipeCodeThemeLoader },
});

const DOCUMENT = documentOf("code", (b) => [
  b.codeBlock(
    "typescript",
    'import { createEditor } from "@gotipe/core";\nimport { DefaultPreset } from "@gotipe/core/presets";\n\nconst editor = await createEditor({ extensions: [DefaultPreset] });\neditor.chain().setBlockType("codeBlock", { language: "rust" }).run();',
  ),
  b.codeBlock(
    "rust",
    'fn main() {\n    let words = ["block", "first"];\n    println!("{}", words.join("-"));\n}',
  ),
]);

export function CodeDemo() {
  const editor = useEditor({ engine: "js", extensions: [FullPreset], content: DOCUMENT });
  return (
    <DemoScroll>
      <BlockEditor
        editor={editor}
        highlight={highlight}
        showAiCommandBar={false}
        ariaLabel="Code blocks"
      />
    </DemoScroll>
  );
}
