import { BlockEditor } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import type { ThemePreset } from "@gotipe/theme";
import { useState } from "react";
import { code, documentOf, link, text } from "../frame/content";
import { Choice, DemoScroll, DemoTools } from "../frame/tools";
import "../frame/editor-styles";

const VIEWS = [
  { value: "notion", label: "notion" },
  { value: "docs", label: "docs" },
  { value: "modern", label: "modern" },
  { value: "minimal", label: "minimal" },
] as const satisfies readonly { value: ThemePreset; label: string }[];

const DOCUMENT = documentOf("views", (b) => [
  b.heading(3, "Offline drafts"),
  b.paragraph(
    text("Each edit goes to a local "),
    text("journal", code),
    text(" first, then to the server, as the "),
    text("release notes", link("/docs/concepts/transactions")),
    text(" describe."),
  ),
  b.list("bulletList", [
    b.item("Drafts survive a closed tab"),
    b.item("Conflicts resolve per block"),
  ]),
  b.block("callout", [text("Drafts stay encrypted on the device.")], { type: "info", emoji: "" }),
]);

export function ViewsDemo() {
  const editor = useEditor({ engine: "js", extensions: [FullPreset], content: DOCUMENT });
  const [view, setView] = useState<ThemePreset>("notion");

  return (
    <>
      <DemoTools label="View">
        <Choice label="View" options={VIEWS} value={view} onChange={setView} />
      </DemoTools>
      <DemoScroll>
        <BlockEditor editor={editor} view={view} showAiCommandBar={false} />
      </DemoScroll>
    </>
  );
}
