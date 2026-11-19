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

/** Two sections written at one place of the page, each by its own cursor of one lane. */
const WRITTEN = [
  {
    id: "summary",
    name: "Summary",
    text: "\n\n## Summary\n\nThe page shows **every block** the editor draws, with `code` and [links](https://example.com).\n\n- lists and tasks\n- a table\n",
  },
  {
    id: "steps",
    name: "Next steps",
    text: "\n\n## Next steps\n\n1. Read the page.\n2. Accept what fits.\n\n```sh\nnpm install @gotipe/block-editor\n```\n",
  },
];

/** The longest of the written texts: `demoWriting` is done at that many characters. */
export const WRITING_LENGTH = Math.max(...WRITTEN.map((part) => part.text.length));

/**
 * A demo of text being written into the page: growing proposals (`live`) that insert at one
 * point in their `order`, and a cursor for each. With all `shown` characters written they are
 * ordinary proposals to accept or reject.
 */
export function demoWriting(
  generation: number,
  shown: number,
): { proposals: ReviewProposal[]; cursors: LaneCursor[] } {
  const live = shown < WRITING_LENGTH;
  return {
    proposals: WRITTEN.map((part, index) => ({
      id: `${part.id}-${generation}`,
      laneId: "reviewer",
      reason: `A written section: ${part.name}.`,
      live,
      order: index,
      edits: [
        {
          before: 'const message = "Hello, world";\n```',
          quote: "",
          after: "\n\n<details>",
          text: part.text.slice(0, shown),
        },
      ],
    })),
    cursors: live
      ? WRITTEN.map((part) => ({
          laneId: "reviewer",
          id: part.id,
          name: part.name,
          label: "writing",
          compact: true,
          proposalId: `${part.id}-${generation}`,
        }))
      : [],
  };
}
