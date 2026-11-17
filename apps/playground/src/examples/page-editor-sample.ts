import type { LaneCursor, ReviewComment, ReviewLane, ReviewProposal } from "@gotipe/suggestions";

/** Neutral Markdown exercising the public document and review contracts. */
export const PAGE_MARKDOWN = `---
title: editor-example
---

# Editor document

> **Agent instructions:** Keep the document's structure and formatting.

## List

- [x] Check the text
- [ ] Check the formatting
- [ ] Check the table

## Table

| Item | Count | Done |
| :--- | ---: | :---: |
| \`alpha\` |  | no |
| \`beta\` |  | no |
| \`gamma\` |  | no |
| \`delta\` |  | yes |

> [!NOTE]
> Text with \`code\` keeps its formatting.

\`\`\`typescript
const message = "Hello, world";
\`\`\`

<details>
<summary>More information</summary>

The source Markdown stays available.
</details>

A footnote example[^note].

[^note]: The footnote text is kept unchanged.
`;

export const PAGE_LANES: ReviewLane[] = [
  { id: "user", name: "You", kind: "user", color: "var(--gt-track-4)" },
  { id: "reviewer", name: "Reviewer", kind: "agent", color: "var(--gt-track-1)" },
  { id: "validator", name: "Validator", kind: "tool", color: "var(--gt-track-3)" },
];

export function demoReview(generation: number): {
  proposals: ReviewProposal[];
  comments: ReviewComment[];
  cursors: LaneCursor[];
} {
  const addId = `add-${generation}`;
  return {
    proposals: [
      {
        id: addId,
        laneId: "reviewer",
        reason: "An example of added lines.",
        edits: [
          {
            before: "- [ ] Check the table",
            quote: "",
            after: "\n\n## Table",
            text: "\n- [ ] Check the links\n- [ ] Check the export",
          },
        ],
      },
      {
        id: `counts-${generation}`,
        laneId: "validator",
        reason: "An example of table edits.",
        edits: [
          { before: "| `alpha` | ", quote: "", after: " | no |\n| `beta`", text: "3" },
          { before: "| `beta` | ", quote: "", after: " | no |\n| `gamma`", text: "7" },
          { before: "| `gamma` | ", quote: "", after: " | no |\n| `delta`", text: "12" },
          { before: "| `delta` | ", quote: "", after: " | yes |", text: "1" },
        ],
      },
      {
        id: `format-${generation}`,
        laneId: "reviewer",
        reason: "An example of replaced text.",
        edits: [
          {
            before: "- [ ] ",
            quote: "Check the formatting",
            after: "\n",
            text: "Check the formatting and links",
          },
        ],
      },
    ],
    comments: [
      {
        id: `comment-${generation}`,
        laneId: "reviewer",
        question: true,
        anchor: { before: "- [ ] ", quote: "Check the table", after: "\n" },
        text: "Make sure every cell is filled in.",
      },
    ],
    cursors: [{ laneId: "reviewer", label: "Demo suggestion", proposalId: addId }],
  };
}
