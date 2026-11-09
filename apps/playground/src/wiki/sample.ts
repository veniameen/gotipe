import type { LaneCursor, ReviewComment, ReviewLane, ReviewProposal } from '@gotipe/suggestions';

/** The page file as it lies in Git (docs/pages/vykat-statusov-zadach.md). */
export const SAMPLE_PAGE = `---
owner: m.lebedeva
---

# Выкат статусов задач

> **Инструкции для агента:** Цифры — только из базы стенда, миграции — по правилам компании.

## Порядок

- [x] Снять дамп tasks на стенде
- [ ] Миграция 0042: справочник и status_id
- [ ] Индекс по status_id

## Статусы на стенде

| code | Задач | Legacy |
| :--- | ---: | :---: |
| \`open\` |  | нет |
| \`in_progress\` |  | нет |
| \`done\` |  | нет |
| \`new\` |  | да |

> [!NOTE]
> Колонка Legacy — статусы, которые остаются в \`tasks.status\` до релиза.

\`\`\`sql
SELECT status, count(*) FROM tasks GROUP BY status;
\`\`\`

![Схема статусов](assets/statuses.png "Схема статусов")

[выгрузка-стенда.csv](assets/выгрузка-стенда.csv)

<details>
<summary>Почему не enum</summary>

Enum в Postgres нельзя менять в транзакции.
</details>

Подробности — в ADR[^adr].

[^adr]: docs/adr/0042-task-statuses.md
`;

export const LANES: ReviewLane[] = [
  { id: 'you', name: 'Вы', kind: 'user', color: 'var(--gt-track-4)' },
  { id: 'agent', name: 'Агент', kind: 'agent', color: 'var(--gt-track-1)' },
  { id: 'lint', name: 'company-lint', kind: 'skill', color: 'var(--gt-track-2)' },
  { id: 'psql', name: 'psql', kind: 'tool', color: 'var(--gt-track-3)' },
];

/** The model's turn: what arrives, and when (ms from the start). */
export interface TurnStep {
  at: number;
  cursors?: LaneCursor[];
  proposal?: ReviewProposal;
  comment?: ReviewComment;
}

export const TURN: TurnStep[] = [
  {
    at: 0,
    cursors: [
      {
        laneId: 'agent',
        label: 'Дописывает порядок',
        anchor: { before: '- [ ] Индекс по ', quote: 'status_id', after: '\n\n## Статусы' },
      },
      {
        laneId: 'psql',
        label: '5 строк · 0,4 с',
        anchor: { before: '| `open` |', quote: '', after: '  | нет |' },
      },
    ],
  },
  {
    at: 900,
    proposal: {
      id: 'p-order',
      laneId: 'agent',
      reason: 'Порядок выката по шагам миграции.',
      edits: [
        {
          before: '- [ ] Индекс по status_id',
          quote: '',
          after: '\n\n## Статусы',
          text: '\n- [ ] Переключить listTasks на status_id\n- [ ] Через релиз — удалить tasks.status',
        },
      ],
    },
    cursors: [
      { laneId: 'agent', label: 'Дописывает порядок', proposalId: 'p-order' },
      {
        laneId: 'psql',
        label: '5 строк · 0,4 с',
        anchor: { before: '| `open` |', quote: '', after: '  | нет |' },
      },
    ],
  },
  {
    at: 1900,
    proposal: {
      id: 'p-counts',
      laneId: 'psql',
      reason: 'Цифры из базы стенда.',
      edits: [
        { before: '| `open` | ', quote: '', after: ' | нет |\n| `in_progress`', text: '1 204' },
        { before: '| `in_progress` | ', quote: '', after: ' | нет |\n| `done`', text: '312' },
        { before: '| `done` | ', quote: '', after: ' | нет |\n| `new`', text: '9 871' },
        { before: '| `new` | ', quote: '', after: ' | да |', text: '3' },
      ],
    },
    cursors: [
      { laneId: 'agent', label: 'Дописывает порядок', proposalId: 'p-order' },
      { laneId: 'psql', label: '5 строк · 0,4 с', proposalId: 'p-counts' },
      {
        laneId: 'lint',
        label: 'Пишет комментарий',
        anchor: { before: '- [ ] ', quote: 'Индекс по status_id', after: '\n' },
      },
    ],
  },
  {
    at: 2700,
    comment: {
      id: 'c-index',
      laneId: 'lint',
      anchor: { before: '- [ ] ', quote: 'Индекс по status_id', after: '\n' },
      text: 'Правило компании: индекс на большой таблице — CREATE INDEX CONCURRENTLY, отдельной миграцией.',
      question: true,
    },
    proposal: {
      id: 'p-title',
      laneId: 'agent',
      reason: 'Точнее о том, что делает миграция.',
      edits: [
        {
          before: '- [ ] ',
          quote: 'Миграция 0042: справочник и status_id',
          after: '\n',
          text: 'Миграция 0042: справочник task_statuses и status_id',
        },
      ],
    },
    cursors: [],
  },
];
