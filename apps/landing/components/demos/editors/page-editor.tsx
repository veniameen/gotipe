import { PageEditor } from "@gotipe/block-editor";
import { useState } from "react";
import "../frame/editor-styles";

// PageEditor reads the file's leading `# heading` as the page title, an h1 it always draws
// (empty, «Untitled», without one); so the samples start with it.
const MARKDOWN = `# Meeting notes

Decisions from **Tuesday**.

- [x] Ship the *page editor*
- [ ] Write the migration guide

| Area | Owner |
| :--- | :--- |
| Docs | Ana |
| Engine | Lev |
`;

export function PageEditorDemo() {
  const [markdown, setMarkdown] = useState(MARKDOWN);
  return (
    <div className="site-demo-stack">
      <div className="site-demo-scroll">
        <PageEditor markdown={MARKDOWN} onChange={setMarkdown} locale="en" />
      </div>
      <section className="site-demo-output" aria-label="Markdown output">
        <p className="site-demo-output-title">Markdown</p>
        <pre className="site-demo-output-code">
          <code>{markdown}</code>
        </pre>
      </section>
    </div>
  );
}
