import type { LaneCursor, ReviewComment, ReviewLane, ReviewProposal } from "@gotipe/suggestions";

/** Neutral Markdown exercising the public document and review contracts. */
export const PAGE_MARKDOWN = `---
title: editor-example
---

# Документ редактора

> **Инструкции для агента:** Сохраняйте структуру и форматирование документа.

## Список

- [x] Проверить текст
- [ ] Проверить форматирование
- [ ] Проверить таблицу

## Таблица

| Элемент | Количество | Готово |
| :--- | ---: | :---: |
| \`alpha\` |  | нет |
| \`beta\` |  | нет |
| \`gamma\` |  | нет |
| \`delta\` |  | да |

> [!NOTE]
> Текст с \`кодом\` сохраняет форматирование.

\`\`\`typescript
const message = "Привет, мир";
\`\`\`

<details>
<summary>Дополнительная информация</summary>

Исходный Markdown остаётся доступным.
</details>

Пример сноски[^note].

[^note]: Текст сноски сохраняется без изменений.
`;

export const PAGE_LANES: ReviewLane[] = [
  { id: "user", name: "Вы", kind: "user", color: "var(--gt-track-4)" },
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
        reason: "Пример добавления строк.",
        edits: [
          {
            before: "- [ ] Проверить таблицу",
            quote: "",
            after: "\n\n## Таблица",
            text: "\n- [ ] Проверить ссылки\n- [ ] Проверить экспорт",
          },
        ],
      },
      {
        id: `counts-${generation}`,
        laneId: "validator",
        reason: "Пример правок в таблице.",
        edits: [
          { before: "| `alpha` | ", quote: "", after: " | нет |\n| `beta`", text: "3" },
          { before: "| `beta` | ", quote: "", after: " | нет |\n| `gamma`", text: "7" },
          { before: "| `gamma` | ", quote: "", after: " | нет |\n| `delta`", text: "12" },
          { before: "| `delta` | ", quote: "", after: " | да |", text: "1" },
        ],
      },
      {
        id: `format-${generation}`,
        laneId: "reviewer",
        reason: "Пример замены текста.",
        edits: [
          {
            before: "- [ ] ",
            quote: "Проверить форматирование",
            after: "\n",
            text: "Проверить форматирование и ссылки",
          },
        ],
      },
    ],
    comments: [
      {
        id: `comment-${generation}`,
        laneId: "reviewer",
        question: true,
        anchor: { before: "- [ ] ", quote: "Проверить таблицу", after: "\n" },
        text: "Убедитесь, что все ячейки заполнены.",
      },
    ],
    cursors: [{ laneId: "reviewer", label: "Demo suggestion", proposalId: addId }],
  };
}
