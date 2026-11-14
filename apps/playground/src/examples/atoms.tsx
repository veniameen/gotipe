import { BlockEditor, type MentionItem, atomExtensions } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider, useEditor } from "@gotipe/react";
import { ExampleWrapper } from "../shared/example-wrapper";
import { useDebugEditor } from "../shared/use-debug-editor";

/** The team's own emoji: a raster `data:` image passes the editor's image check. */
const GOTIPE_EMOJI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAiUlEQVR42u2Xyw3AIAxDPVCn6szdhw5QVeRnDIJI3IL8DvkZ6MR1Py3zEImsaBiGJWwCGSX+CyEFGC3+gVgKoBdugCrhKAgY4h4IRMUteRQAS76rDirFQ52wDABtFmQBsh2xBwC1COUA2X+UQeTJp47iEgD5MqKvY/lBcm7C4wumsWZTmFOFPX8B/FjBBuhzrGoAAAAASUVORK5CYII=";

const PEOPLE: MentionItem[] = [
  { id: "u3", label: "Анна Ковалёва" },
  { id: "u1", label: "Андрей Соколов" },
  { id: "u2", label: "Ольга Антонова" },
  { id: "u4", label: "Илья Орлов" },
  { id: "p1", label: "Анализ обращений за октябрь", kind: "page" },
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
      text("Схему журнала проверили "),
      {
        text: "@Илья Орлов",
        marks: [atom("mention", { id: "u4", label: "Илья Орлов", kind: "user" }, "m1")],
      },
      text(" и "),
      {
        text: "@Анна Ковалёва",
        marks: [atom("mention", { id: "u3", label: "Анна Ковалёва", kind: "user" }, "m2")],
      },
      text(", решение записано в "),
      {
        text: "ADR-0031",
        marks: [atom("mention", { id: "p2", label: "ADR-0031", kind: "page" }, "m3")],
      },
      text("."),
    ]),
    paragraph("emoji", [
      text("Все проверки прошли, сборка подписана "),
      {
        text: ":gotipe:",
        marks: [atom("customEmoji", { name: "gotipe", src: GOTIPE_EMOJI }, "e1")],
      },
      text(" — спасибо всем, кто гонял журнал на своих устройствах 🙏"),
    ]),
    paragraph("math", [
      text("Доля потерянных правок "),
      { text: "p = \\frac{L}{N}", marks: [atom("inlineMath", {}, "f1")] },
      text(" за неделю должна остаться ниже "),
      { text: "10^{-3}", marks: [atom("inlineMath", {}, "f2")] },
      text(", где "),
      { text: "L", marks: [atom("inlineMath", {}, "f3")] },
      text(" — правки, не дошедшие до сервера."),
    ]),
    paragraph("invalid", [
      text("Формула с ошибкой: "),
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
    paragraph("end", [text("Наберите «@ан», «:пра», «/эмодзи» или $x^2$.")]),
  ],
};

export function AtomsExample() {
  const editor = useEditor({ extensions: [FullPreset, ...atomExtensions()], content: CONTENT });
  useDebugEditor("__GOTIPE_ATOMS_EDITOR__", editor);
  return (
    <ExampleWrapper
      title="Mentions, emoji, formulas"
      description="Atlas frames 22–24: atoms of a line, the «@» and «:» lists, the emoji picker of «/» and the formula popover. Commercial license."
      tags={["Commercial"]}
    >
      <GoTipeI18nProvider locale="ru">
        <BlockEditor editor={editor} mentions={mentions} emoji={emoji} showAiCommandBar={false} />
      </GoTipeI18nProvider>
    </ExampleWrapper>
  );
}
