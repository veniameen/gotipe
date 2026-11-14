import { BlockEditor } from "@gotipe/block-editor";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { code, documentOf, text } from "../frame/content";
import { DemoScroll } from "../frame/tools";
import "../frame/editor-styles";

/**
 * One table with every column type (text, code, number, yes/no) and merged cells: a header over
 * two columns, two headers over two rows, a body cell over two rows. Open a header cell's menu
 * for the type; drag across cells, then «Merge cells» or «Split cell».
 */
/** Column widths that fit the window's width beside the row handle; a phone scrolls the table. */
const COLUMNS = [130, 160, 120, 154];

const DOCUMENT = documentOf("tables", (b) => {
  const head = (value: string, attrs: Record<string, number> = {}) => b.cell(value, attrs, true);
  const key = (value: string) => b.cell([text(value, code)]);
  return [
    b.table(
      [
        b.row([
          head("Platform", { rowspan: 2 }),
          head("Drafts", { colspan: 2 }),
          head("Encrypted", { rowspan: 2 }),
        ]),
        b.row([head("Store"), head("Queued")]),
        b.row([b.cell("Web"), key("drafts.web"), b.cell("1,284"), b.cell("yes", { rowspan: 2 })]),
        b.row([b.cell("macOS"), key("drafts.mac"), b.cell("312")]),
        b.row([b.cell("iOS"), key("drafts.ios"), b.cell("0"), b.cell("no")]),
      ],
      { align: [null, null, "right", null], colWidths: COLUMNS },
    ),
  ];
});

export function TablesDemo() {
  const editor = useEditor({ engine: "js", extensions: [DefaultPreset], content: DOCUMENT });
  return (
    <DemoScroll>
      <BlockEditor editor={editor} showAiCommandBar={false} ariaLabel="Drafts by platform" />
    </DemoScroll>
  );
}
