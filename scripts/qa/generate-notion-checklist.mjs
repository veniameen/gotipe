import fs from "node:fs";
import path from "node:path";

const outPath = path.resolve("docs/notion-like-qa/04-checklist-500.md");

let id = 1;
const sections = [];

function idLabel() {
  return `NL-${String(id++).padStart(3, "0")}`;
}

function addSection(title, items) {
  sections.push({ title, items });
}

function formatItem(item) {
  const caseId = idLabel();
  return `- [ ] ${caseId} | ${item.action} | Expected: ${item.expected} | Priority: ${item.priority} | Auto: ${item.automation}`;
}

/* A. Caret and selection fundamentals (60) */
{
  const contexts = [
    "empty paragraph",
    "paragraph with plain text",
    "paragraph with mixed marks (bold/italic)",
    "heading 1",
    "heading 2",
    "bullet item with text",
    "bullet item without text",
    "ordered item with text",
    "todo item without text",
    "todo item with text",
  ];

  const actions = [
    {
      action: "Click at the start of the block",
      expected: "the caret is placed at the start of the content, without jumping to the left edge",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Click in the middle of the text",
      expected: "the caret is placed at the expected character position",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "Click at the end of the text",
      expected: "the caret is at the end of the block, typing continues this block",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "ArrowLeft from position 0",
      expected: "moves to the end of the previous block without skipping or crashing",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "ArrowRight from the end of the block",
      expected: "moves to the start of the next block without desync",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Mouse drag selection into the adjacent block",
      expected: "the range stays visible, toolbar/bubble menu reacts correctly",
      priority: "P1",
      automation: "Planned",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("A. Caret & Selection Fundamentals (60)", items);
}

/* B. Typing and line breaks (60) */
{
  const contexts = [
    "empty paragraph",
    "paragraph with text",
    "heading 1",
    "heading 3",
    "bullet item",
    "ordered item",
    "todo item",
    "blockquote",
    "code block",
    "callout",
  ];

  const actions = [
    {
      action: "Type plain text",
      expected: "characters appear once, with no duplicates or gaps",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Press Enter",
      expected: "a valid next block/list item is created",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Press Shift+Enter",
      expected: "a soft line break is added inside the current block",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Backspace in the middle of a line",
      expected: "one character to the left is deleted, the caret does not jump",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Backspace at the start of a line",
      expected: "merge/unwrap happens predictably for the block type",
      priority: "P0",
      automation: "Planned",
    },
    {
      action: "Delete (forward)",
      expected: "the character to the right is deleted without losing the selection",
      priority: "P1",
      automation: "Planned",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("B. Typing, Enter, Backspace (60)", items);
}

/* C. Slash menu behavior (80) */
{
  const contexts = [
    "empty paragraph",
    "start of a non-empty paragraph",
    "middle of a paragraph",
    "end of a heading",
    "empty bullet item",
    "todo item with text",
    "right after paste",
    "near the bottom edge of the viewport",
    "near the right edge of the viewport",
    "in dark theme",
  ];

  const actions = [
    {
      action: "Type '/'",
      expected: "the menu opens at the caret, not in the top-left corner",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Type '/to'",
      expected: "filtering is correct, relevant commands come first",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "ArrowDown + Enter",
      expected: "the selected command runs without losing focus",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "ArrowUp + Enter",
      expected: "upward navigation wraps around/is predictable",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Esc",
      expected: "the menu closes, the document is not mutated",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Click outside the menu",
      expected: "the menu closes, the editor stays interactive",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "Query with no matches",
      expected: "an empty state is shown, the layout does not break",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Delete the query with Backspace until empty",
      expected: "the command list returns to its default order",
      priority: "P2",
      automation: "Planned",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("C. Slash Menu UX & Positioning (80)", items);
}

/* D. Transform matrix via slash (120) */
{
  const sources = [
    "paragraph",
    "heading 1",
    "heading 2",
    "heading 3",
    "bullet item",
    "ordered item",
    "todo item",
    "blockquote",
    "code block",
    "callout",
  ];

  const targets = [
    "text",
    "heading 1",
    "heading 2",
    "heading 3",
    "bullet list",
    "numbered list",
    "todo list",
    "blockquote",
    "code block",
    "divider",
    "table",
    "image",
  ];

  const items = [];
  for (const src of sources) {
    for (const dst of targets) {
      items.push({
        action: `Slash transform: ${src} -> ${dst}`,
        expected: "the target block is created validly, the text of the current line is not lost, the caret stays in the new block",
        priority: "P0",
        automation: "Planned",
      });
    }
  }
  addSection("D. Slash Transform Cross-Matrix (120)", items);
}

/* E. Todo/list edge cases (70) */
{
  const contexts = [
    "first list item",
    "middle list item",
    "last list item",
    "item with long text",
    "item with inline marks",
    "empty item",
    "item after paste",
    "item after undo/redo",
    "item right after slash transform",
    "item in dark theme",
  ];

  const actions = [
    {
      action: "Click checkbox",
      expected: "the checked state changes, the text stays in place and does not jump",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Caret placement in an empty todo",
      expected: "the caret is placed after the checkbox in the text area",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Type text in a todo",
      expected: "the text is vertically aligned with the checkbox, the gap is stable",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Enter in a non-empty todo",
      expected: "the next todo item is created",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Enter in an empty todo",
      expected: "exits to a paragraph outside the list",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Slash convert todo -> bullet",
      expected: "the line text is preserved, the type changes without the line disappearing",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Slash convert bullet -> todo",
      expected: "the line text is preserved, the checkbox renders correctly",
      priority: "P0",
      automation: "E2E",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("E. Todo/List Stress Cases (70)", items);
}

/* F. Formatting and selection retention (40) */
{
  const contexts = [
    "selection inside a paragraph",
    "selection inside a heading",
    "selection inside a bullet item",
    "selection inside an ordered item",
    "selection inside a todo item",
    "selection across 2 blocks",
    "collapsed caret in the middle of a word",
    "collapsed caret at the end of a word",
  ];

  const actions = [
    {
      action: "Toggle Bold",
      expected: "the mark is applied correctly, the visual highlight does not disappear prematurely",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Toggle Italic",
      expected: "the mark is applied to the current range without losing focus",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "Toggle Underline",
      expected: "the mark toggles on/off symmetrically",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Command via bubble menu",
      expected: "the bubble menu stays consistent and does not break the selection",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Command via keyboard shortcut",
      expected: "the shortcut matches the toolbar behavior",
      priority: "P1",
      automation: "Planned",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("F. Formatting & Highlight Retention (40)", items);
}

/* G. Clipboard, IME, history (30) */
{
  const contexts = [
    "paragraph",
    "heading",
    "bullet item",
    "todo item",
    "code block",
    "multi-block selection",
  ];

  const actions = [
    {
      action: "Copy + Paste",
      expected: "the text is pasted without duplicates, the structure does not break",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Cut + Undo",
      expected: "after undo the state is fully restored",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "IME composition",
      expected: "the composition is not lost, characters are not doubled",
      priority: "P0",
      automation: "Manual",
    },
    {
      action: "Undo/Redo chain (10 steps)",
      expected: "history is deterministic, no DOM/state divergence",
      priority: "P0",
      automation: "Planned",
    },
    {
      action: "Slash + Undo + Redo",
      expected: "the transform and its inverse operations are stable",
      priority: "P0",
      automation: "E2E",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("G. Clipboard, IME, Undo/Redo (30)", items);
}

/* H. Gutter, drag and block controls (20) */
{
  const contexts = [
    "paragraph",
    "heading",
    "bullet list",
    "todo list",
    "code block",
  ];

  const actions = [
    {
      action: "Hover left gutter",
      expected: "the + button and drag handle appear next to the block, not at the outer left edge",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Click plus button",
      expected: "block insertion works without shifting the active line",
      priority: "P1",
      automation: "Planned",
    },
    {
      action: "Drag block down",
      expected: "the block moves, content and selection are preserved",
      priority: "P1",
      automation: "Manual",
    },
    {
      action: "Drag block up",
      expected: "the order changes correctly, with no visual artifacts",
      priority: "P1",
      automation: "Manual",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("H. Gutter Toolbar & Drag Controls (20)", items);
}

/* I. Theme, responsive, accessibility (20) */
{
  const contexts = [
    "desktop light theme",
    "desktop dark theme",
    "mobile viewport 390px",
    "tablet viewport 768px",
    "system theme auto",
  ];

  const actions = [
    {
      action: "Open the slash menu",
      expected: "colors, shadows, border and padding are consistent with the theme",
      priority: "P1",
      automation: "E2E",
    },
    {
      action: "Check overflow of the search/menu body",
      expected: "the input and items do not overflow the container",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Keyboard navigation (Up/Down/Enter/Esc)",
      expected: "all keys work the same in both themes",
      priority: "P0",
      automation: "E2E",
    },
    {
      action: "Screen reader semantics",
      expected: "role/aria attributes are valid, focus is announced correctly",
      priority: "P2",
      automation: "Manual",
    },
  ];

  const items = [];
  for (const ctx of contexts) {
    for (const act of actions) {
      items.push({
        action: `${act.action} (${ctx})`,
        expected: act.expected,
        priority: act.priority,
        automation: act.automation,
      });
    }
  }
  addSection("I. Theme, Responsive, A11y (20)", items);
}

const totalCases = sections.reduce((sum, sec) => sum + sec.items.length, 0);
if (totalCases !== 500) {
  throw new Error(`Expected 500 cases, got ${totalCases}`);
}

const lines = [];
lines.push("# Notion-like QA Checklist (500 actions)");
lines.push("");
lines.push("_Last updated: February 13, 2026_");
lines.push("");
lines.push("## How to use");
lines.push("");
lines.push("- Each item is a separate test case for editor behavior.");
lines.push("- `Auto: E2E`: can/should be covered by a Playwright test.");
lines.push("- `Auto: Planned`: add to automation in upcoming iterations.");
lines.push("- `Auto: Manual`: manual check only for now (usually IME/DnD/a11y cases).");
lines.push("");
lines.push(`Total cases: **${totalCases}**.`);
lines.push("");

for (const section of sections) {
  lines.push(`## ${section.title}`);
  lines.push("");
  for (const item of section.items) {
    lines.push(formatItem(item));
  }
  lines.push("");
}

fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Generated ${outPath} with ${totalCases} cases.`);
