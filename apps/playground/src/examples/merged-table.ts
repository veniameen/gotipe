/**
 * A table with merged cells (GoTipe Atlas, frame 29): a header over two columns, two header rows
 * under tall headers, and a body cell over two rows. Select cells by dragging across them or with
 * Shift, then use “Merge cells” or “Split cell” in a row or column menu.
 */
const text = (value: string, code = false) => [
  { text: value, marks: code ? [{ type: "code", attrs: {} }] : [] },
];
const cell = (
  id: string,
  value: string,
  attrs: Record<string, number | string> = {},
  header = false,
  code = false,
) => ({
  id,
  type: header ? "tableHeader" : "tableCell",
  attrs,
  content: text(value, code),
  children: [],
});
const row = (id: string, children: ReturnType<typeof cell>[]) => ({
  id,
  type: "tableRow",
  attrs: {},
  content: null,
  children,
});

export const MERGED_TABLE_BLOCKS = [
  {
    id: "merged-title",
    type: "heading",
    attrs: { level: 2 },
    content: text("Drafts by platform"),
    children: [],
  },
  {
    id: "merged-table",
    type: "table",
    attrs: { align: [null, null, "right", null] },
    content: null,
    children: [
      row("merged-r0", [
        cell("merged-platform", "Platform", { rowspan: 2 }, true),
        cell("merged-log", "Log", { colspan: 2 }, true),
        cell("merged-crypto", "Encryption", { rowspan: 2 }, true),
      ]),
      row("merged-r1", [
        cell("merged-key", "Key", {}, true),
        cell("merged-queue", "Queued", {}, true),
      ]),
      row("merged-r2", [
        cell("merged-web", "Web"),
        cell("merged-web-key", "drafts.web", {}, false, true),
        cell("merged-web-queue", "1,284"),
        cell("merged-session", "Session key", { rowspan: 2 }),
      ]),
      row("merged-r3", [
        cell("merged-mac", "macOS"),
        cell("merged-mac-key", "drafts.mac", {}, false, true),
        cell("merged-mac-queue", "312"),
      ]),
      row("merged-r4", [
        cell("merged-ios", "iOS"),
        cell("merged-ios-key", "drafts.ios", {}, false, true),
        cell("merged-ios-queue", "0"),
        cell("merged-ios-crypto", "None"),
      ]),
      row("merged-r5", [
        cell("merged-android", "Android"),
        cell("merged-android-key", "drafts.android", {}, false, true),
        cell("merged-android-queue", "27"),
        cell("merged-android-crypto", "Device key"),
      ]),
    ],
  },
];
