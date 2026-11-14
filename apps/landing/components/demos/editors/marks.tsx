import { BlockEditor } from "@gotipe/block-editor";
import { DOCUMENT_TEXT_COLORS } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { bold, code, documentOf, italic, link, mark, text } from "../frame/content";
import { DemoScroll } from "../frame/tools";
import "../frame/editor-styles";

/** A colour of the document palette: the stored value; the editor draws it through its token. */
const blue = DOCUMENT_TEXT_COLORS.find((color) => color.name === "Blue")?.value;

const DOCUMENT = documentOf("marks", (b) => [
  b.paragraph(
    text("Text can be "),
    text("bold", bold),
    text(", "),
    text("italic", italic),
    text(", "),
    text("underlined", mark("underline")),
    text(", "),
    text("struck through", mark("strikethrough")),
    text(" or "),
    text("inline code", code),
    text("."),
  ),
  b.paragraph(
    text("A "),
    text("link", link("/docs/extensions/marks#links")),
    text(", a "),
    text("highlight", mark("highlight")),
    text(", "),
    ...(blue ? [text("coloured text", mark("textColor", { color: blue })), text(", ")] : []),
    text("x"),
    text("2", mark("superscript")),
    text(" and H"),
    text("2", mark("subscript")),
    text("O."),
  ),
]);

export function MarksDemo() {
  const editor = useEditor({ engine: "js", extensions: [FullPreset], content: DOCUMENT });
  return (
    <DemoScroll>
      <BlockEditor editor={editor} showAiCommandBar={false} ariaLabel="Marks" />
    </DemoScroll>
  );
}
