/** Reusable document content objects for playground templates. */

function uid() {
  return `b-${Math.random().toString(36).slice(2, 10)}`;
}

/** Rich content showcasing all block types — used by Notion-like template. */
export const RICH_CONTENT = {
  version: 1,
  blocks: [
    {
      id: uid(),
      type: "heading",
      attrs: { level: 1 },
      content: [{ text: "Welcome to GoTipe", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "paragraph",
      attrs: {},
      content: [
        { text: "GoTipe is a ", marks: [] },
        { text: "block-first", marks: [{ type: "bold", attrs: {} }] },
        { text: " rich-text editor framework built with Rust/WASM. It offers a ", marks: [] },
        { text: "Notion-like", marks: [{ type: "italic", attrs: {} }] },
        {
          text: " editing experience with real-time collaboration, AI features, and full customizability.",
          marks: [],
        },
      ],
      children: [],
    },
    {
      id: uid(),
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Key Features", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        {
          id: uid(),
          type: "listItem",
          attrs: {},
          content: [
            { text: "Slash commands", marks: [{ type: "bold", attrs: {} }] },
            { text: " \u2014 type ", marks: [] },
            { text: "/", marks: [{ type: "code", attrs: {} }] },
            { text: " to insert any block type", marks: [] },
          ],
          children: [],
        },
        {
          id: uid(),
          type: "listItem",
          attrs: {},
          content: [
            { text: "Bubble menu", marks: [{ type: "bold", attrs: {} }] },
            { text: " \u2014 select text to format inline", marks: [] },
          ],
          children: [],
        },
        {
          id: uid(),
          type: "listItem",
          attrs: {},
          content: [
            { text: "Drag & drop", marks: [{ type: "bold", attrs: {} }] },
            { text: " \u2014 hover left edge to reorder blocks", marks: [] },
          ],
          children: [],
        },
        {
          id: uid(),
          type: "listItem",
          attrs: {},
          content: [
            { text: "Dark mode", marks: [{ type: "bold", attrs: {} }] },
            { text: " \u2014 toggle via the theme switcher", marks: [] },
          ],
          children: [],
        },
      ],
    },
    {
      id: uid(),
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Code Example", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "codeBlock",
      attrs: { language: "typescript" },
      content:
        "import { createEditor } from '@gotipe/core';\nimport { DefaultPreset } from '@gotipe/core/presets';\n\nconst editor = await createEditor({\n  extensions: [DefaultPreset],\n  content: { version: 1, blocks: [] },\n});",
      children: [],
    },
    {
      id: uid(),
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Collaboration", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "callout",
      attrs: { emoji: "\u{1F91D}" },
      content: [
        {
          text: "Invite your colleagues to edit in real-time. GoTipe uses a custom CRDT engine for conflict-free collaboration over WebSocket.",
          marks: [],
        },
      ],
      children: [],
    },
    {
      id: uid(),
      type: "blockquote",
      attrs: {},
      content: [
        {
          text: "The best editor is the one that gets out of your way.",
          marks: [{ type: "italic", attrs: {} }],
        },
      ],
      children: [],
    },
    {
      id: uid(),
      type: "heading",
      attrs: { level: 3 },
      content: [{ text: "Task List", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "todoList",
      attrs: {},
      content: null,
      children: [
        {
          id: uid(),
          type: "todoItem",
          attrs: { checked: true },
          content: [{ text: "Set up the editor", marks: [] }],
          children: [],
        },
        {
          id: uid(),
          type: "todoItem",
          attrs: { checked: true },
          content: [{ text: "Add extensions", marks: [] }],
          children: [],
        },
        {
          id: uid(),
          type: "todoItem",
          attrs: { checked: false },
          content: [{ text: "Ship to production", marks: [] }],
          children: [],
        },
      ],
    },
    {
      id: uid(),
      type: "divider",
      attrs: {},
      content: null,
      children: [],
    },
    {
      id: uid(),
      type: "paragraph",
      attrs: {},
      content: [
        { text: "Try selecting text above to see the ", marks: [] },
        { text: "bubble menu", marks: [{ type: "highlight", attrs: { color: "#dbeafe" } }] },
        { text: ", or type ", marks: [] },
        { text: "/", marks: [{ type: "code", attrs: {} }] },
        { text: " at the start of a new line to open the slash menu.", marks: [] },
      ],
      children: [],
    },
  ],
};

/** Simple content for Simple & Headless templates. */
export const SIMPLE_CONTENT = {
  version: 1,
  blocks: [
    {
      id: uid(),
      type: "heading",
      attrs: { level: 1 },
      content: [{ text: "Getting Started", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "paragraph",
      attrs: {},
      content: [
        { text: "This is a ", marks: [] },
        { text: "simple editor", marks: [{ type: "bold", attrs: {} }] },
        {
          text: " with a classic toolbar interface. Use the buttons above to format your text, insert blocks, and toggle dark mode.",
          marks: [],
        },
      ],
      children: [],
    },
    {
      id: uid(),
      type: "paragraph",
      attrs: {},
      content: [
        { text: "You can make text ", marks: [] },
        { text: "bold", marks: [{ type: "bold", attrs: {} }] },
        { text: ", ", marks: [] },
        { text: "italic", marks: [{ type: "italic", attrs: {} }] },
        { text: ", ", marks: [] },
        { text: "underlined", marks: [{ type: "underline", attrs: {} }] },
        { text: ", or apply ", marks: [] },
        { text: "highlights", marks: [{ type: "highlight", attrs: { color: "#d1fae5" } }] },
        { text: " to draw attention to key phrases.", marks: [] },
      ],
      children: [],
    },
    {
      id: uid(),
      type: "paragraph",
      attrs: {},
      content: [
        { text: "Markdown shortcuts are supported: try typing ", marks: [] },
        { text: "**bold**", marks: [{ type: "code", attrs: {} }] },
        { text: ", ", marks: [] },
        { text: "## heading", marks: [{ type: "code", attrs: {} }] },
        { text: ", or ", marks: [] },
        { text: "- list item", marks: [{ type: "code", attrs: {} }] },
        { text: " at the start of a line.", marks: [] },
      ],
      children: [],
    },
  ],
};

/** AI Agent demo content with highlighted "to be determined" text. */
export const AGENT_CONTENT = {
  version: 1,
  blocks: [
    {
      id: uid(),
      type: "heading",
      attrs: { level: 1 },
      content: [{ text: "Product Requirements Document", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Overview", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "paragraph",
      attrs: {},
      content: [
        {
          text: "This document outlines the requirements for the next version of our platform. The target release date is Q3 2026.",
          marks: [],
        },
      ],
      children: [],
    },
    {
      id: uid(),
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Goals", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "orderedList",
      attrs: {},
      content: null,
      children: [
        {
          id: uid(),
          type: "listItem",
          attrs: {},
          content: [{ text: "Improve onboarding flow conversion rate by 20%", marks: [] }],
          children: [],
        },
        {
          id: uid(),
          type: "listItem",
          attrs: {},
          content: [{ text: "Reduce p95 API latency to under 200ms", marks: [] }],
          children: [],
        },
        {
          id: uid(),
          type: "listItem",
          attrs: {},
          content: [
            { text: "Launch mobile app \u2014 ", marks: [] },
            {
              text: "to be determined",
              marks: [{ type: "highlight", attrs: { color: "#fef3c7" } }],
            },
          ],
          children: [],
        },
      ],
    },
    {
      id: uid(),
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "Technical Approach", marks: [] }],
      children: [],
    },
    {
      id: uid(),
      type: "paragraph",
      attrs: {},
      content: [
        {
          text: "The backend will be migrated from the current monolith to a microservices architecture. ",
          marks: [],
        },
        {
          text: "The specific service boundaries and communication patterns are to be determined",
          marks: [{ type: "highlight", attrs: { color: "#fef3c7" } }],
        },
        { text: " pending the architecture review in Sprint 4.", marks: [] },
      ],
      children: [],
    },
    {
      id: uid(),
      type: "paragraph",
      attrs: {},
      content: [
        {
          text: "Use the AI actions on the left to proofread, generate content, or get AI review comments on this document.",
          marks: [{ type: "italic", attrs: {} }],
        },
      ],
      children: [],
    },
  ],
};
