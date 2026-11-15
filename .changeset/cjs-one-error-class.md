---
"@gotipe/core": patch
---

The CommonJS entries of `@gotipe/core` share one copy of the package's code, as its ES module
entries already did. Before, every `require` entry (`@gotipe/core`, `/js`, `/extensions`,
`/presets`, `/server`) carried its own `GoTipeError` class, so in Jest and other `require`
consumers `error instanceof GoTipeError` was false for an error raised by another entry. Now an
error from any entry is an instance of the `GoTipeError` that every entry exports. In CommonJS,
`@gotipe/core/server` loads the editor with `require` on first use, so Jest runs it without ES
module support. The CommonJS files are about half their former size; the ES module files are
unchanged.
