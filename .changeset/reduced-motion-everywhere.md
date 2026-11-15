---
"@gotipe/theme": patch
---

`prefers-reduced-motion: reduce` now stills every GoTipe element, not only `.gotipe-editor`: the
AI command bar and its status, spinners, the drop indicator, ghost text, menus and toasts —
portals included — with what they hold and their `::before` and `::after`. Endless animations
run once, so a spinner stands still instead of flickering at 0.01 ms per turn.
