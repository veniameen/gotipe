# Step 1A: Hover + Left Gutter Controls

## Scenario

- Create multiple text rows.
- Move mouse across rows and measure hidden/visible state of row controls.
- Validate exact controls, location, and transition behavior.

## Repro Sequence

1. Open page and create rows:
1. `ref452312-hover-alpha`
1. `ref452312-hover-beta`
1. `ref452312-hover-gamma`
1. Move pointer away from row (`x=1200`) and sample controls (`before`).
1. Move pointer to row-left gutter (`rowX - 20`) and sample at `+40ms` and `+260ms`.

## Measured Output

- Source: `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-audit-2026-02-13T22-57-32-311Z.json` (`S02`)

- Hidden state before hover:
- No gutter controls are detected near row (`before: []` for all 3 rows).

- Visible state after hover:
- Control 1:
- `aria-label="Drag to move, click to open menu"`
- geometry near row: `18x24`
- Control 2:
- `aria-label="Click to add below. Option-click to add a block above"`
- geometry near row: `24x24`

- Animation/transition style captured:
- `transitionDuration: 0.02s`
- `transitionProperty: background`
- `opacity: 1` once visible

## Positioning Pattern

- Row content x-position around `484`.
- `+` control appears around `x=432`.
- Drag handle appears around `x=456`.
- Vertical position follows row center exactly (per-row y changes tracked in JSON).

## Visual Artifacts

- Hover screenshot:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/deep-2026-02-13T22-57-32-311Z/02-gutter-hover.png`

- Additional control probe JSON:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/controls-inspect.json`

- Per-row control screenshots:
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/controls-row-1.png`
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/controls-row-2.png`
- `/Users/veniameen/Projects/gotipe/output/playwright/notion-step1/controls-row-3.png`

## Parity Requirements for Our Editor

- Controls must not exist in interactive state before row hover.
- On hover, reveal exactly two controls aligned to hovered row.
- Keep stable gutter geometry:
- left button (`+`) before drag handle,
- vertical centering by row center, not container top.
- Micro-animation should be short and unobtrusive (Notion measured `0.02s` on captured theme/build).
