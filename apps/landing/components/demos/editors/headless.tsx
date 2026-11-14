import type { GoTipeEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { Editor, useEditor, useEditorState } from "@gotipe/react";
import { bold, code, documentOf, text } from "../frame/content";
import { DemoScroll, DemoTools, ToolButton } from "../frame/tools";
import "../frame/editor-styles";

const DOCUMENT = documentOf("headless", (b) => [
  b.heading(3, "Launch checklist"),
  b.paragraph(
    text("Ship the beta on Monday, then "),
    text("open it to everyone", bold),
    text(" a week later."),
  ),
  b.paragraph(text("Pricing stays as it is until "), text("v2.9", code), text(".")),
]);

type Chain = ReturnType<GoTipeEditor["chain"]>;

interface Pressed {
  bold: boolean;
  italic: boolean;
  code: boolean;
  heading: boolean;
  list: boolean;
  undo: boolean;
  redo: boolean;
}

const samePressed = (a: Pressed, b: Pressed) =>
  (Object.keys(a) as (keyof Pressed)[]).every((key) => a[key] === b[key]);

export function HeadlessDemo() {
  const editor = useEditor({ engine: "js", extensions: [DefaultPreset], content: DOCUMENT });
  const state = useEditorState(
    editor,
    ({ toolbar }): Pressed => ({
      bold: toolbar.activeMarks.includes("bold"),
      italic: toolbar.activeMarks.includes("italic"),
      code: toolbar.activeMarks.includes("code"),
      heading: toolbar.activeBlockType === "heading" && toolbar.activeBlockAttrs.level === 2,
      list: toolbar.activeBlockType === "listItem",
      undo: toolbar.canUndo,
      redo: toolbar.canRedo,
    }),
    samePressed,
  );
  const run = (apply: (chain: Chain) => Chain) => {
    if (editor) apply(editor.chain().focus()).run();
  };
  const off = !editor;

  return (
    <>
      <DemoTools label="Formatting">
        <ToolButton disabled={off} pressed={state?.bold} onClick={() => run((c) => c.toggleBold())}>
          Bold
        </ToolButton>
        <ToolButton
          disabled={off}
          pressed={state?.italic}
          onClick={() => run((c) => c.toggleItalic())}
        >
          Italic
        </ToolButton>
        <ToolButton disabled={off} pressed={state?.code} onClick={() => run((c) => c.toggleCode())}>
          Code
        </ToolButton>
        <ToolButton
          disabled={off}
          pressed={state?.heading}
          onClick={() =>
            run((c) =>
              state?.heading
                ? c.setBlockType("paragraph")
                : c.setBlockType("heading", { level: 2 }),
            )
          }
        >
          Heading
        </ToolButton>
        <ToolButton
          disabled={off}
          pressed={state?.list}
          onClick={() => run((c) => c.toggleBulletList())}
        >
          List
        </ToolButton>
        <ToolButton disabled={off || !state?.undo} onClick={() => run((c) => c.undo())}>
          Undo
        </ToolButton>
        <ToolButton disabled={off || !state?.redo} onClick={() => run((c) => c.redo())}>
          Redo
        </ToolButton>
      </DemoTools>
      <DemoScroll>
        <Editor editor={editor} className="site-demo-headless" ariaLabel="Headless editor" />
      </DemoScroll>
    </>
  );
}
