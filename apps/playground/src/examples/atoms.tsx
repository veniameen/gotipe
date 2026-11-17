import { BlockEditor, type MentionItem, atomExtensions } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider, useEditor } from "@gotipe/react";
import { ExampleWrapper } from "../shared/example-wrapper";
import { useDebugEditor } from "../shared/use-debug-editor";

/** The team's own emoji: a raster `data:` image passes the editor's image check. */
const GOTIPE_EMOJI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAiUlEQVR42u2Xyw3AIAxDPVCn6szdhw5QVeRnDIJI3IL8DvkZ6MR1Py3zEImsaBiGJWwCGSX+CyEFGC3+gVgKoBdugCrhKAgY4h4IRMUteRQAS76rDirFQ52wDABtFmQBsh2xBwC1COUA2X+UQeTJp47iEgD5MqKvY/lBcm7C4wumsWZTmFOFPX8B/FjBBuhzrGoAAAAASUVORK5CYII=";

const PEOPLE: MentionItem[] = [
  { id: "u3", label: "Anna Kovaleva" },
  { id: "u1", label: "Andrew Sokolov" },
  { id: "u2", label: "Olga Antonova" },
  { id: "u4", label: "Ilya Orlov" },
  { id: "p1", label: "Analysis of October support tickets", kind: "page" },
  { id: "p2", label: "ADR-0031", kind: "page" },
];

/** The host's directory: people first, then pages, matched by the start of a word. */
const mentions = {
  items(query: string) {
    const needle = query.toLowerCase();
    return PEOPLE.filter((item) =>
      item.label
        .toLowerCase()
        .split(/\s+/)
        .some((word) => word.startsWith(needle)),
    );
  },
};
const emoji = { custom: [{ name: "gotipe", src: GOTIPE_EMOJI }] };

const atom = (type: string, attrs: Record<string, unknown>, key: string) => ({
  type,
  attrs: { ...attrs, key },
});
const text = (value: string) => ({ text: value, marks: [] });
const paragraph = (id: string, content: object[]) => ({
  id,
  type: "paragraph",
  attrs: {},
  content,
  children: [],
});

/** Atlas frames 22–24 as a document: mentions, a custom emoji, formulas in a line and a block. */
const CONTENT = {
  version: 1,
  blocks: [
    paragraph("mentions", [
      text("The journal schema was checked by "),
      {
        text: "@Ilya Orlov",
        marks: [atom("mention", { id: "u4", label: "Ilya Orlov", kind: "user" }, "m1")],
      },
      text(" and "),
      {
        text: "@Anna Kovaleva",
        marks: [atom("mention", { id: "u3", label: "Anna Kovaleva", kind: "user" }, "m2")],
      },
      text("; the decision is recorded in "),
      {
        text: "ADR-0031",
        marks: [atom("mention", { id: "p2", label: "ADR-0031", kind: "page" }, "m3")],
      },
      text("."),
    ]),
    paragraph("emoji", [
      text("All checks passed, the build is signed "),
      {
        text: ":gotipe:",
        marks: [atom("customEmoji", { name: "gotipe", src: GOTIPE_EMOJI }, "e1")],
      },
      text(". Thanks to everyone who ran the journal on their devices 🙏"),
    ]),
    paragraph("math", [
      text("The share of lost edits "),
      { text: "p = \\frac{L}{N}", marks: [atom("inlineMath", {}, "f1")] },
      text(" over a week must stay below "),
      { text: "10^{-3}", marks: [atom("inlineMath", {}, "f2")] },
      text(", where "),
      { text: "L", marks: [atom("inlineMath", {}, "f3")] },
      text(" is the edits that never reached the server."),
    ]),
    paragraph("invalid", [
      text("A formula with an error: "),
      { text: "p = \\frac{L}{N", marks: [atom("inlineMath", {}, "f4")] },
      text("."),
    ]),
    {
      id: "block",
      type: "math",
      attrs: { display: "block" },
      content: "p = \\frac{lost}{lost + sent}",
      children: [],
    },
    paragraph("end", [text("Type “@an”, “:par”, “/emoji” or $x^2$.")]),
  ],
};

export function AtomsExample() {
  const editor = useEditor({ extensions: [FullPreset, ...atomExtensions()], content: CONTENT });
  useDebugEditor("__GOTIPE_ATOMS_EDITOR__", editor);
  return (
    <ExampleWrapper
      title="Mentions, emoji, formulas"
      description="Atlas frames 22–24: atoms of a line, the “@” and “:” lists, the emoji picker of the slash menu and the formula popover. Commercial license."
      tags={["Commercial"]}
    >
      <GoTipeI18nProvider locale="en">
        <BlockEditor editor={editor} mentions={mentions} emoji={emoji} showAiCommandBar={false} />
      </GoTipeI18nProvider>
    </ExampleWrapper>
  );
}
