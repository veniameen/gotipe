import { BlockEditor } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import type { ThemePreset } from "@gotipe/theme";
import { useCallback, useState } from "react";
import { useDebugEditor } from "../shared/use-debug-editor";
import { MERGED_TABLE_BLOCKS } from "./merged-table";

const INITIAL_CONTENT = {
  version: 1,
  blocks: [
    {
      id: "b1",
      type: "heading",
      attrs: { level: 1 },
      content: [{ text: "Welcome to GoTipe", marks: [] }],
      children: [],
    },
    {
      id: "b2",
      type: "paragraph",
      attrs: {},
      content: [
        { text: "This is a ", marks: [] },
        { text: "block-first", marks: [{ type: "bold" }] },
        { text: " rich text editor powered by ", marks: [] },
        { text: "Rust/WASM", marks: [{ type: "code" }] },
        {
          text: ". It features a Notion-like editing experience with real-time collaboration.",
          marks: [],
        },
      ],
      children: [],
    },
    {
      id: "b3",
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Features", marks: [] }],
      children: [],
    },
    {
      id: "b4",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        {
          id: "b4a",
          type: "listItem",
          attrs: {},
          content: [
            { text: "Rich text formatting: ", marks: [] },
            { text: "bold", marks: [{ type: "bold" }] },
            { text: ", ", marks: [] },
            { text: "italic", marks: [{ type: "italic" }] },
            { text: ", ", marks: [] },
            { text: "underline", marks: [{ type: "underline" }] },
            { text: ", ", marks: [] },
            { text: "strikethrough", marks: [{ type: "strikethrough" }] },
          ],
          children: [],
        },
        {
          id: "b4b",
          type: "listItem",
          attrs: {},
          content: [{ text: "Block-first document model (not ProseMirror)", marks: [] }],
          children: [],
        },
        {
          id: "b4c",
          type: "listItem",
          attrs: {},
          content: [{ text: "CRDT-based real-time collaboration", marks: [] }],
          children: [],
        },
        {
          id: "b4d",
          type: "listItem",
          attrs: {},
          content: [{ text: "AI-powered features: ghost text, rewrite, proofread", marks: [] }],
          children: [],
        },
      ],
    },
    {
      id: "b5",
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Code Example", marks: [] }],
      children: [],
    },
    {
      id: "b6",
      type: "codeBlock",
      attrs: { language: "typescript" },
      content:
        "import { createEditor } from '@gotipe/core';\nimport { FullPreset } from '@gotipe/core/presets';\n\nconst editor = await createEditor({\n  extensions: [FullPreset],\n  content: { version: 1, blocks: [] },\n});",
      children: [],
    },
    {
      id: "b7",
      type: "blockquote",
      attrs: {},
      content: [
        { text: "GoTipe aims to be the fastest and most extensible editor framework, ", marks: [] },
        { text: "with Rust performance at its core.", marks: [{ type: "italic" }] },
      ],
      children: [],
    },
    {
      id: "b8",
      type: "divider",
      attrs: {},
      content: null,
      children: [],
    },
    // --- Phase 3.9: Callout ---
    {
      id: "b9",
      type: "callout",
      attrs: { emoji: "💡" },
      content: [
        { text: "Type ", marks: [] },
        { text: "/", marks: [{ type: "code" }] },
        { text: " to open the slash menu and insert blocks.", marks: [] },
      ],
      children: [],
    },
    // --- Phase 3.10: Image (placeholder, no src) ---
    {
      id: "b10",
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Image Block", marks: [] }],
      children: [],
    },
    {
      id: "b11",
      type: "image",
      attrs: {
        src: "https://picsum.photos/seed/gotipe/640/360",
        alt: "Sample image",
        caption: "A sample image from Picsum",
      },
      content: null,
      children: [],
    },
    {
      id: "b11b",
      type: "image",
      attrs: { src: "", alt: "" },
      content: null,
      children: [],
    },
    // --- Phase 3.11: Table (3x3 with header row) ---
    {
      id: "b12",
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Table Block", marks: [] }],
      children: [],
    },
    {
      id: "b13",
      type: "table",
      attrs: {},
      content: null,
      children: [
        {
          id: "b13r1",
          type: "tableRow",
          attrs: {},
          content: null,
          children: [
            {
              id: "b13h1",
              type: "tableHeader",
              attrs: {},
              content: [{ text: "Feature", marks: [{ type: "bold" }] }],
              children: [],
            },
            {
              id: "b13h2",
              type: "tableHeader",
              attrs: {},
              content: [{ text: "Status", marks: [{ type: "bold" }] }],
              children: [],
            },
            {
              id: "b13h3",
              type: "tableHeader",
              attrs: {},
              content: [{ text: "Notes", marks: [{ type: "bold" }] }],
              children: [],
            },
          ],
        },
        {
          id: "b13r2",
          type: "tableRow",
          attrs: {},
          content: null,
          children: [
            {
              id: "b13c1",
              type: "tableCell",
              attrs: {},
              content: [{ text: "Callout", marks: [] }],
              children: [],
            },
            {
              id: "b13c2",
              type: "tableCell",
              attrs: {},
              content: [
                { text: "Done", marks: [{ type: "highlight", attrs: { color: "#dcfce7" } }] },
              ],
              children: [],
            },
            {
              id: "b13c3",
              type: "tableCell",
              attrs: {},
              content: [{ text: "With emoji support", marks: [] }],
              children: [],
            },
          ],
        },
        {
          id: "b13r3",
          type: "tableRow",
          attrs: {},
          content: null,
          children: [
            {
              id: "b13c4",
              type: "tableCell",
              attrs: {},
              content: [{ text: "Image", marks: [] }],
              children: [],
            },
            {
              id: "b13c5",
              type: "tableCell",
              attrs: {},
              content: [
                { text: "Done", marks: [{ type: "highlight", attrs: { color: "#dcfce7" } }] },
              ],
              children: [],
            },
            {
              id: "b13c6",
              type: "tableCell",
              attrs: {},
              content: [{ text: "Upload + placeholder", marks: [] }],
              children: [],
            },
          ],
        },
        {
          id: "b13r4",
          type: "tableRow",
          attrs: {},
          content: null,
          children: [
            {
              id: "b13c7",
              type: "tableCell",
              attrs: {},
              content: [{ text: "Table", marks: [] }],
              children: [],
            },
            {
              id: "b13c8",
              type: "tableCell",
              attrs: {},
              content: [
                { text: "Done", marks: [{ type: "highlight", attrs: { color: "#dcfce7" } }] },
              ],
              children: [],
            },
            {
              id: "b13c9",
              type: "tableCell",
              attrs: {},
              content: [{ text: "Header + cells", marks: [] }],
              children: [],
            },
          ],
        },
      ],
    },
    // merged cells, Atlas frame 29
    ...MERGED_TABLE_BLOCKS,
    // --- Phase 3.12: Toggle ---
    {
      id: "b14",
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Toggle Block", marks: [] }],
      children: [],
    },
    {
      id: "b15",
      type: "toggle",
      attrs: { open: true },
      content: [{ text: "Click to expand/collapse this section", marks: [] }],
      children: [
        {
          id: "b15a",
          type: "paragraph",
          attrs: {},
          content: [
            {
              text: "This content is inside a collapsible toggle block. You can put any blocks here.",
              marks: [],
            },
          ],
          children: [],
        },
        {
          id: "b15b",
          type: "bulletList",
          attrs: {},
          content: null,
          children: [
            {
              id: "b15b1",
              type: "listItem",
              attrs: {},
              content: [{ text: "Nested list item 1", marks: [] }],
              children: [],
            },
            {
              id: "b15b2",
              type: "listItem",
              attrs: {},
              content: [{ text: "Nested list item 2", marks: [] }],
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: "b15c",
      type: "toggle",
      attrs: { open: false },
      content: [{ text: "This toggle is closed by default", marks: [] }],
      children: [
        {
          id: "b15d",
          type: "paragraph",
          attrs: {},
          content: [{ text: "Hidden content revealed on click.", marks: [] }],
          children: [],
        },
      ],
    },
    // --- Phase 3.13: Columns ---
    {
      id: "b16",
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Columns Layout", marks: [] }],
      children: [],
    },
    {
      id: "b17",
      type: "columns",
      attrs: { count: 2 },
      content: null,
      children: [
        {
          id: "b17a",
          type: "column",
          attrs: {},
          content: null,
          children: [
            {
              id: "b17a1",
              type: "heading",
              attrs: { level: 3 },
              content: [{ text: "Left Column", marks: [] }],
              children: [],
            },
            {
              id: "b17a2",
              type: "paragraph",
              attrs: {},
              content: [
                {
                  text: "This is the left column of a two-column layout. Each column can contain any block types.",
                  marks: [],
                },
              ],
              children: [],
            },
          ],
        },
        {
          id: "b17b",
          type: "column",
          attrs: {},
          content: null,
          children: [
            {
              id: "b17b1",
              type: "heading",
              attrs: { level: 3 },
              content: [{ text: "Right Column", marks: [] }],
              children: [],
            },
            {
              id: "b17b2",
              type: "paragraph",
              attrs: {},
              content: [
                {
                  text: "This is the right column. Columns are great for side-by-side comparisons and layouts.",
                  marks: [],
                },
              ],
              children: [],
            },
          ],
        },
      ],
    },
  ],
};

type ExportFormat = "html" | "markdown" | "json" | null;

export function BlockEditorExample() {
  const editor = useEditor({
    extensions: [FullPreset],
    content: INITIAL_CONTENT,
  });

  const [view, setView] = useState<ThemePreset>("notion");
  const [exportFormat, setExportFormat] = useState<ExportFormat>(null);
  const [exportOutput, setExportOutput] = useState("");

  useDebugEditor("__GOTIPE_EDITOR__", editor);

  const handleExport = useCallback(
    (format: ExportFormat) => {
      if (!editor || !format) return;
      let output = "";
      switch (format) {
        case "html":
          output = editor.getHTML();
          break;
        case "markdown":
          output = editor.getMarkdown();
          break;
        case "json":
          output = JSON.stringify(editor.getJSON(), null, 2);
          break;
      }
      setExportFormat(format);
      setExportOutput(output);
    },
    [editor],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(exportOutput);
  }, [exportOutput]);

  return (
    <div
      data-gotipe-example="basic"
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <label className="gotipe-editor-view">
        Вид
        <select
          value={view}
          onChange={(event) => setView(event.target.value as ThemePreset)}
          aria-label="Вид редактора"
        >
          {(["notion", "docs", "modern", "minimal"] as const).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <BlockEditor
        editor={editor}
        view={view}
        showSlashMenu={true}
        showBlockToolbar={true}
        showThemeToggle={true}
      />

      {/* Export bar */}
      <div className="gotipe-export-bar" data-gotipe-export-bar>
        <span className="gotipe-export-label">Export:</span>
        <button
          type="button"
          className={`gotipe-export-btn ${exportFormat === "html" ? "active" : ""}`}
          data-gotipe-export="html"
          onClick={() => handleExport("html")}
        >
          HTML
        </button>
        <button
          type="button"
          className={`gotipe-export-btn ${exportFormat === "markdown" ? "active" : ""}`}
          data-gotipe-export="markdown"
          onClick={() => handleExport("markdown")}
        >
          Markdown
        </button>
        <button
          type="button"
          className={`gotipe-export-btn ${exportFormat === "json" ? "active" : ""}`}
          data-gotipe-export="json"
          onClick={() => handleExport("json")}
        >
          JSON
        </button>
        {exportFormat && (
          <>
            <button
              type="button"
              className="gotipe-export-btn"
              data-gotipe-export-copy
              onClick={handleCopy}
            >
              Copy
            </button>
            <button
              type="button"
              className="gotipe-export-btn"
              onClick={() => {
                setExportFormat(null);
                setExportOutput("");
              }}
            >
              Close
            </button>
          </>
        )}
      </div>

      {/* Export output panel */}
      {exportFormat && (
        <div className="gotipe-export-panel" data-gotipe-export-output>
          <pre className="gotipe-export-pre">{exportOutput}</pre>
        </div>
      )}
    </div>
  );
}
