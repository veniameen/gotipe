/** The document of the GoTipe Atlas, frames 1–5: real text in every block the views draw. */

type Mark = { type: string; attrs?: Record<string, unknown> };
type Span = { text: string; marks: Mark[] };
interface Block {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  content: Span[] | string | null;
  children: Block[];
}

let next = 0;
const id = () => `atlas-${++next}`;
const text = (value: string, ...marks: Mark[]): Span => ({ text: value, marks });
const link = (href: string): Mark => ({ type: "link", attrs: { href } });
const block = (
  type: string,
  content: Span[] | string | null,
  attrs: Record<string, unknown> = {},
  children: Block[] = [],
): Block => ({ id: id(), type, attrs, content, children });
const paragraph = (...spans: Span[]) => block("paragraph", spans);
const heading = (level: number, value: string) => block("heading", [text(value)], { level });
const item = (value: string, children: Block[] = []) =>
  block("listItem", [text(value)], {}, children);
const list = (type: "bulletList" | "orderedList", items: Block[]) => block(type, null, {}, items);
const task = (value: string, checked: boolean) => block("todoItem", [text(value)], { checked });
const row = (cell: "tableHeader" | "tableCell", values: string[]) =>
  block(
    "tableRow",
    null,
    {},
    values.map((value) => block(cell, [text(value)])),
  );

export const ATLAS_TITLE = "Offline drafts";

export const ATLAS_DOCUMENT = {
  version: 1,
  blocks: [
    paragraph(
      text(
        "An edit made offline is lost today if the tab is closed before the connection comes back. In release 2.8 the editor writes every transaction to a local journal and sends it as soon as the network returns. The decision builds on ",
      ),
      text("ADR-0031", link("https://example.com/adr-0031")),
      text(" and on the October support tickets."),
    ),
    block(
      "callout",
      [
        text(
          "The draft is stored only on the device and encrypted with the session key. Signing out deletes it together with the key.",
        ),
      ],
      { type: "info", emoji: "" },
    ),
    heading(1, "How it works"),
    paragraph(
      text("The journal lives in "),
      text("IndexedDB", { type: "code" }),
      text(
        " and survives an app restart. The server accepts a batch of transactions whole or rejects it: ",
      ),
      text("half a batch can never be written", { type: "highlight" }),
      text("."),
    ),
    heading(2, "What changes"),
    list("bulletList", [
      item("Every transaction goes to the journal first and only then to the server."),
      item(
        "When the connection is back, the journal goes out as a batch and the server replies with a new version of the document.",
      ),
      item("Conflicts are resolved block by block:", [
        list("bulletList", [
          item("someone else's edit of a block never overwrites yours;"),
          item("both versions stay, yours as a suggested edit."),
        ]),
      ]),
    ]),
    block(
      "codeBlock",
      '// The journal is written before sending: a closed tab loses nothing.\neditor.on("transaction", async ({ steps, version }: Transaction) => {\n  await drafts.append(documentId, { steps, version });\n  if (navigator.onLine) await drafts.flush(documentId, { retries: 3 });\n});',
      { language: "typescript" },
    ),
    heading(3, "Rollout order"),
    list("orderedList", [
      item("Enable the journal for 5 % of web users."),
      item("For a week, compare the share of lost edits with a control group."),
      item("Open it to everyone, starting with the macOS app."),
    ]),
    block(
      "callout",
      [
        text(
          "Until release 2.9 the draft does not move between devices: an edit from a laptop will not appear on a phone until it is sent.",
        ),
      ],
      { type: "warning", emoji: "" },
    ),
    heading(1, "Conflicts"),
    block("table", null, {}, [
      row("tableHeader", ["Situation", "What the author sees", "What is kept"]),
      row("tableCell", ["Block changed only on your side", "Nothing", "Your version"]),
      row("tableCell", ["Block changed on both sides", "A suggested edit", "Both versions"]),
      row("tableCell", [
        "Block deleted on the server",
        "A “Block deleted” toast",
        "Your version, in history",
      ]),
      row("tableCell", ["Document deleted", "A restore dialog", "A copy in “Drafts”"]),
    ]),
    block("blockquote", [
      text("I wrote two pages on the train, and when I got off they were just gone."),
    ]),
    block("toggle", [text("Why not Background Sync?")], { open: true }, [
      paragraph(
        text(
          "Background Sync isn’t available in Safari, and our macOS app runs in WKWebView. A journal in IndexedDB behaves the same on every platform we ship, and the editor can read it back without the network.",
        ),
      ),
    ]),
    heading(2, "Tasks"),
    block("todoList", null, {}, [
      task("Journal schema and IndexedDB migration", true),
      task("Draft encryption with the session key", true),
      task("A “Not sent” indicator in the page header", false),
      task("A lost-edits metric on the release dashboard", false),
    ]),
    block("divider", null),
    paragraph(
      text("Objections are welcome until November 18 in the ADR-0031 discussion or in the "),
      text("release 2.8 thread", link("https://example.com/release-2-8")),
      text("."),
    ),
  ],
};
