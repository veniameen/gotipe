---
"@gotipe/core": minor
---

`editor.validate()` and `renderToHtml`, `renderToMarkdown` and `renderToText` from
`@gotipe/core/server` take a document object only. A string used to be document JSON there and
HTML in `createEditor({ content })` and `setContent`, so the same string was a document in one
place and a parse error in the other. Now a string is HTML only in `content` and `setContent`.
`validate(string)` returns `false`, and `renderTo*(string)` rejects with a `TypeError` that
says to parse the JSON first. The types accept `object` only. To migrate, parse the JSON
yourself:

```ts
const html = await renderToHtml(JSON.parse(json)); // was renderToHtml(json)
```
