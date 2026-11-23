# GoTipe development

These rules apply across the whole repository, including to Claude and Codex. The owner's request
authorizes the usual steps within a task: research, edits, builds and checks.
Don't ask for repeated permission for reversible actions. Publishing and external
messages require a request that says so. Don't change licenses for convenience.

## Required reading

1. Find the area in the [code map](docs/development/code-map.md).
2. Pick the scenario and checks from the [matrix](docs/development/testing.md).
3. Internal plans, the release log and competitor research are kept outside this repository;
   don't add them here.
4. Search only the sources you need; exclude node_modules, dist, target, pkg, output.

## Architecture and SOLID

- GoTipe is an editor library. Wiki, page tree, tabs, saving, permissions and model
  workflows belong to the consuming application.
  The playground demonstrates the public components and contracts; don't move a
  copy of a host application into it, and don't turn it into a separate product screen.
- One module is responsible for one domain task. Entry points wire the owners together
  rather than hold the implementation of yet another feature. Don't create a general
  dumping ground of utils/services.
- Extend the editor through extensions, commands, views and provider/host contracts.
  Don't add a branch for a specific application to the engine.
- JS and Rust/WASM follow one contract for the document, transactions, UTF-16 offsets,
  errors and history. Swapping the engine doesn't change the public API semantics.
- An interface contains the operations the consumer needs, not the whole Editor/App context.
  Domain logic depends on narrow ports; UI and transport implement their adapters.
- The core, Markdown and SDK don't import UI, frameworks or applications. Packages use
  each other's public entry points. Runtime cycles are forbidden.
- Documents, history, subscriptions, timers, requests and resources each have one owner.
  Importing a module doesn't start work. Creation and cleanup are explicit; a late async
  response after destroy doesn't resurrect the object, and an old response doesn't
  overwrite new state.
- Production TS/JS/Rust/Go/CSS files stay under 600 lines; directories hold at most 24 direct
  code files. This is a reason to extract a responsibility, not to cut a function at a
  line number. Don't dodge the limit with minification, include fragments or anonymous chunks.
- Existing overruns are recorded in `config/architecture-baseline.json`. They must not
  grow; when you shrink one, lower the baseline. Clear the debt before release:
  `pnpm check:architecture:release` accepts no size exceptions.

## Own implementation and dependencies

- The engine, the Markdown parser, document transforms, history, CRDT and small helper
  algorithms belong to GoTipe. Don't pull in ProseMirror, Tiptap, Lexical, mdast/micromark
  or a utility package in place of our own implementation of an area.
- Use the platform and existing modules first. A runtime dependency needs a specific
  justification in the [policy](docs/development/dependencies.md), not age, popularity or
  import convenience. Remove unused dependencies.
- Framework peers belong only to adapters/UI. A headless consumer must not load UI,
  a highlighter, or PDF/DOCX. Don't rewrite cryptography, TLS, storage drivers or
  compilers just to have no dependencies on paper.
- Build/test tools are not part of the engine's runtime. An own implementation is accepted
  on compatibility, robustness and measurements, not on a smaller lockfile.

## Integrity and security

- A document changes through a transaction. Validate the whole batch before writing; an
  error leaves no half-applied edits, history or network operations.
- Preserve nesting, attrs, marks, raw text, IDs and the original bytes of untouched
  Markdown. Never silently drop unknown data.
- Preserve selection/focus/scroll/IME, the order of async operations and undo boundaries.
  Test Cyrillic, emoji, composed characters and nested blocks separately.
- HTML is built from an allowed structure and validated URLs, not inserted as an
  unchecked string. Validation is needed at every trust boundary.
- Cloud checks scope, role and document ownership before granting access. Don't return a
  stub success result. A provider error stays an error.
- Don't hide failures with any/casts, disabling strict/lint, an empty catch, a skipped test
  or `|| true`. Retrying an indeterminate write requires idempotency.

## Interface

- The basis of a view is the [GoTipe Atlas](design/atlas/README.md). Any view change starts
  there: frame → `node design/atlas/check.mjs` → owner decision → code. Code follows the
  accepted frame; a remark about a view is fixed in the drawing, not in code.
- Literal colors and sizes live only in tokens. The `minimal`, `modern`, `notion` and
  `docs` views are sets of `--gt-*` over one markup. There is no separate view, theme or
  naming for a host application: hosts pass their colors through `--gt-*`.
- Reuse `--gt-*` semantic tokens, controls and behavior; don't copy a theme into each
  screen. Icons come from the shared set; emoji and letters are not used instead of icons.
- Check light/dark, long text, empty/loading/error/disabled/read-only states, the keyboard
  and visible focus. A hidden button must not catch Tab.
- Responsiveness depends on the container too. Widths: 320, 375, 768, 1024, 1440 px.
  Text and buttons don't overlap; wide tables and code scroll locally.
- A menu is measured before it is shown and follows its anchor on scroll/resize/layout
  changes. A handle or toolbar appearing doesn't shift the document or break the pointer path.
- A screenshot doesn't prove drag, input, undo or selection preservation.

## Workflow and acceptance

- Language: everything in the repository is in English: code, comments, docs, changesets and
  commit messages. Russian appears only in the editor's Russian locale (`ru` dictionaries,
  Russian emoji names) and in test data that exercises it.
- Commit messages are in English and carry no `Co-Authored-By` or "Generated with" trailers.
- A finished change covers all consumers. Keep moving code separate from changing
  behavior. Before a move, pin down exports, dependencies and lifecycle.
- Parallel agents own different files; shared manifests/lock/bootstrap are integrated by
  one owner. Don't undo other people's or the user's changes.
- After an edit, run targeted checks by risk. The full suite is acceptance of the final
  tree. Reproduce a failure, fix it and rerun; having a test is not the same as running it.
- Update contracts, the code map, examples and the changeset together with the public API.
  Don't declare a feature done because it builds, and don't publish fictitious metrics.
- Diagnostics, logs and screenshots go in the ignored `output/`. Docs keep only maintained
  rules, contracts, plans and decisions. Don't commit secrets or .DS_Store.
- `pnpm check:architecture`, typecheck, lint, the applicable unit/integration/browser
  tests and archive verification are mandatory. The report names the tree, the commands, the
  results and the real limitations.
