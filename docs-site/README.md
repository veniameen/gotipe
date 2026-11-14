# GoTipe documentation source

The public documentation of GoTipe, in English. Every page is a Markdown file; the site
renders it with GoTipe itself (our Markdown codec and the `docs` view), so a page must
be plain GitHub-flavoured Markdown with the few conventions below.

`nav.json` holds the order of sections and pages. A page that is not in `nav.json` is
not published.

## A page

```md
---
title: Tables
description: One sentence for search results and link previews.
packages: ["@gotipe/core", "@gotipe/react"]
license: MIT
---

Short introduction: what it is and when to use it.

## Install
…
```

Front matter keys:

- `title` — required, the page title (the site prints it as H1; do not repeat it).
- `description` — required, one sentence, no Markdown.
- `packages` — optional, the npm packages the page is about.
- `license` — optional, `MIT` or `Commercial` (the site shows a badge).

The body starts at H2 (`##`). Headings H2–H3 form the outline beside the page.

## Conventions

- **Links** between pages are absolute site paths without the extension:
  `[transactions](/docs/concepts/transactions)`. Anchors: `/docs/concepts/commands#chain`.
- **Code** goes in fenced blocks with a language; a title goes in the meta:
  ```` ```ts title="editor.ts" ````.
- **Tabs**: consecutive fenced blocks with a `tab` meta form one tabbed block:
  ```` ```tsx tab="React" ```` followed by ```` ```ts tab="Vue" ````.
- **Install commands** use `npm install`; the site offers pnpm/yarn/bun from it.
- **Callouts** are GFM alerts: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`,
  `> [!WARNING]`, `> [!CAUTION]`.
- **One paragraph** in an alert and in a list item. The GoTipe codec keeps a list, code or
  a second paragraph inside them as raw Markdown, so put such content after the alert;
  a page of limitations is a `## Limitations` section with a plain list.
- **Line breaks**: wrap prose as you like; a soft break of a paragraph reads as a space
  (CommonMark), in the codec and on the site.
- **Live demo**: a fenced block with the language `demo` and one demo name:
  ```` ```demo ```` / `tables` / ```` ``` ````. Names: `block-editor`, `page-editor`,
  `headless`, `views`, `lists`, `marks`, `tables`, `media`, `code`, `collaboration`,
  `comments`, `suggestions`, `versions`, `ai`, `i18n`. At most one per page.
- **Tables** are GFM tables. Options and commands use the columns
  `Option | Type | Default | Description` and `Command | Description`.

## Writing

- Every API name, option, default and limit is checked against the source in this
  repository. Nothing is documented that the code does not do; a limitation is said
  plainly (a `> [!NOTE]`), not hidden.
- Short sentences, second person, present tense. Lead with the code a reader needs.
- No marketing words; other editors are named only in the migration guide.
- Examples are complete enough to paste: imports included, no `...` inside calls.
