# Step 2A: List-row Micro Behavior (Notion)

_Updated: February 14, 2026_

## S2-03: Hover controls on list rows

Rows audited:

- bullet: `s2263992-bullet-a`, `s2263992-bullet-c`
- todo: `s2263992-todo-a`, `s2263992-todo-c`
- ordered: `s2263992-ordered-a`, `s2263992-ordered-c`

Observed pattern:

1. Before hover there are no row controls in the local gutter envelope.
2. At `+40ms` after hover both controls are visible.
3. At `+260ms` controls remain stable with same geometry.

Typical geometry sample (bullet row A):

- Row anchor: `x=512, y=625`
- `+` control: `x=432, y=613, w=24, h=24`
- Drag handle: `x=456, y=613, w=18, h=24`

Timing sample:

- Transition duration observed on controls: `0.02s`
- Transition property: `background`

Conclusion:

- Notion reveals controls only on row hover and keeps controls tightly aligned to hovered row baseline.
- Horizontal offsets are stable across bullet/todo/ordered rows in this viewport.

## S2-04: Slash boundary behavior inside list rows

Scenarios:

1. `withLeadingSpace=true` (`" /to"` in row): menu opens.
2. `withLeadingSpace=false` (`"/to"` directly after text): menu does not open.

Observed in both bullet and todo rows:

- `bulletBoundary.hasMenu = true`
- `bulletInline.hasMenu = false`
- `todoBoundary.hasMenu = true`
- `todoInline.hasMenu = false`

Conclusion:

- Slash-menu in Notion is boundary-sensitive in list rows.
- Direct inline slash after non-whitespace text does not trigger slash menu.

## S2-05: Drag-handle row menu items

Menu opened successfully from drag handle on all three list contexts.

Bullet/ordered include:

- `Turn into`
- `Color`
- `List format`
- `Copy link to block`
- `Duplicate`
- `Move to`
- `Delete`
- `Comment`
- `Suggest edits`
- `Ask AI`

Todo include:

- same set except no `List format` in captured sample.

Conclusion:

- Row menu is context-aware (list formatting options differ by row type).
- `Turn into` is always available in list row handle menu.
