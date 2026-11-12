---
"@gotipe/core": patch
"@gotipe/markdown": minor
---

A task can have sub-tasks. Tab nests a task under the one above it and Shift+Tab lifts it back,
as for bullet and numbered lists (the core used to refuse it for tasks). The Markdown codec reads
and writes lists nested under a task and task lists nested under a list item
(`- [ ] a\n  - [ ] b`), in TypeScript and in Rust; such lists no longer fall back to raw Markdown.
