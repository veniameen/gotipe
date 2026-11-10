---
"@gotipe/core": patch
"@gotipe/react": minor
"@gotipe/block-editor": patch
"@gotipe/theme": patch
---

Share durable image/file controls, code editing controls, table operations and
interactive toggle/callout rendering across the ready editor surfaces. Export
CodeBlock, ToggleBlock and CalloutBlock for custom React views.

Keep code text separate from controls during caret restoration; preserve caption
input, keyboard checkbox activation, read-only previews and atomic table undo.
Place inserted structural blocks in a schema-compatible parent and validate table
and column dimensions before changing the document. Keep block actions reachable
in a stable gutter and support explicit whole-list movement with Alt-drag.

Use one semantic theme token source, locally scrolling wide content, measured
menus and container-aware geometry instead of overlays that displace document text.

Preserve the exact code text when an optional highlighter fails or returns incomplete
tokens, ignore stale asynchronous results, and allow retry of a failed Shiki grammar
load. Share light/dark token styles, including underline, across code views.
Preserve native caret and reversed ranges when asynchronous tokens arrive, defer
token rendering until native IME reconciliation finishes, and retain transaction
selection and independent control focus.
