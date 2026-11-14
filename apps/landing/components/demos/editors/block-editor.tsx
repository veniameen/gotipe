import { BlockEditor } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { bold, code, documentOf, italic, text } from "../frame/content";
import { DemoScroll } from "../frame/tools";
import "../frame/editor-styles";

const DOCUMENT = documentOf("block", (b) => [
  b.heading(3, "Release notes"),
  b.paragraph(
    text("Offline drafts now sync "),
    text("as soon as", bold),
    text(" the network returns, through "),
    text("drafts.flush()", code),
    text("."),
  ),
  b.block("callout", [text("Drafts stay encrypted on the device.")], { type: "info", emoji: "" }),
  b.list("todoList", [b.task("Write the summary", true), b.task("Check the screenshots", false)]),
  b.block("blockquote", [text("Small, fast, and ", italic), text("yours", bold, italic)]),
]);

export function BlockEditorDemo() {
  const editor = useEditor({ engine: "js", extensions: [FullPreset], content: DOCUMENT });
  return (
    <DemoScroll>
      <BlockEditor editor={editor} showAiCommandBar={false} ariaLabel="Release notes" />
    </DemoScroll>
  );
}
