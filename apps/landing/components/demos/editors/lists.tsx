import { BlockEditor } from "@gotipe/block-editor";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { documentOf } from "../frame/content";
import { DemoScroll } from "../frame/tools";
import "../frame/editor-styles";

const DOCUMENT = documentOf("lists", (b) => [
  b.list("bulletList", [
    b.item("Packing list", [b.list("bulletList", [b.item("Passport"), b.item("Charger")])]),
    b.item("Snacks for the train"),
  ]),
  b.list("orderedList", [
    b.item("Book the train"),
    b.item("Pick the seats", [b.list("orderedList", [b.item("Window"), b.item("Quiet car")])]),
  ]),
  b.list("todoList", [b.task("Water the plants", true), b.task("Lock the door", false)]),
]);

export function ListsDemo() {
  const editor = useEditor({ engine: "js", extensions: [DefaultPreset], content: DOCUMENT });
  return (
    <DemoScroll>
      <BlockEditor editor={editor} showAiCommandBar={false} ariaLabel="Lists" />
    </DemoScroll>
  );
}
