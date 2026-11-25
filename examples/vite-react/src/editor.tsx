import { BlockEditor } from "@gotipe/block-editor";
import type { Document, GoTipeEditor } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";

export interface EditorProps {
  /** The document to open: GoTipe JSON or an HTML string. Read once, when the editor is created. */
  initialContent?: Document | string;
  /** Called after every change. Read the document with `editor.getJSON()` or `getMarkdown()`. */
  onChange?: (editor: GoTipeEditor) => void;
}

/**
 * A Notion-style block editor: the `/` menu, the block handle, the formatting bubble, tables,
 * to-do lists, callouts and code. The editor is created in the browser after mount; on the
 * server and until then it shows a loading skeleton.
 */
export function Editor({ initialContent = WELCOME, onChange }: EditorProps) {
  const latestOnChange = useRef(onChange);
  useEffect(() => {
    latestOnChange.current = onChange;
  });
  const editor = useEditor({
    extensions: [FullPreset],
    // "js" runs without WebAssembly. Real-time collaboration needs the Rust engine from
    // @gotipe/wasm: "wasm".
    engine: "js",
    content: initialContent,
    onUpdate: ({ editor }) => latestOnChange.current?.(editor),
  });
  return (
    <div data-theme={useAppTheme()}>
      <BlockEditor editor={editor} showAiCommandBar={false} />
    </div>
  );
}

/**
 * GoTipe takes its palette from `data-theme`. This follows the `light` or `dark` class that a
 * theme switch such as next-themes (used by shadcn/ui) puts on <html>; without one, the OS
 * setting applies.
 */
function useAppTheme() {
  return useSyncExternalStore(watchHtmlClass, htmlTheme, () => undefined);
}

function watchHtmlClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function htmlTheme() {
  const classes = document.documentElement.classList;
  if (classes.contains("dark")) return "dark";
  return classes.contains("light") ? "light" : undefined;
}

const code = { type: "code", attrs: {} };

const WELCOME: Document = {
  version: 1,
  blocks: [
    {
      id: "welcome-title",
      type: "heading",
      attrs: { level: 1 },
      content: [{ text: "Welcome to GoTipe", marks: [] }],
      children: [],
    },
    {
      id: "welcome-intro",
      type: "paragraph",
      attrs: {},
      content: [
        { text: "Type ", marks: [] },
        { text: "/", marks: [code] },
        { text: " on an empty line to insert a block, select text to format it, ", marks: [] },
        { text: "and drag the handle on the left to move a block.", marks: [] },
      ],
      children: [],
    },
    {
      id: "welcome-tasks",
      type: "todoList",
      attrs: {},
      content: null,
      children: [
        {
          id: "welcome-task-open",
          type: "todoItem",
          attrs: { checked: true },
          content: [{ text: "Open the editor", marks: [] }],
          children: [],
        },
        {
          id: "welcome-task-table",
          type: "todoItem",
          attrs: { checked: false },
          content: [
            { text: "Type ", marks: [] },
            { text: "/table", marks: [code] },
            { text: " and press Enter to insert a table", marks: [] },
          ],
          children: [],
        },
        {
          id: "welcome-task-bold",
          type: "todoItem",
          attrs: { checked: false },
          content: [{ text: "Select a word and make it bold", marks: [] }],
          children: [],
        },
      ],
    },
    {
      id: "welcome-save",
      type: "callout",
      attrs: { type: "info", emoji: "" },
      content: [
        { text: "Your app keeps the document: ", marks: [] },
        { text: "onChange", marks: [code] },
        { text: " gets the editor, and ", marks: [] },
        { text: "editor.getJSON()", marks: [code] },
        { text: " or ", marks: [] },
        { text: "editor.getMarkdown()", marks: [code] },
        { text: " returns the content.", marks: [] },
      ],
      children: [],
    },
  ],
};
