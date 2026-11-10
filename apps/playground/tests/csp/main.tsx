import { PageEditor, ThemeToggle } from "@gotipe/block-editor";
import { getTheme, setTheme } from "@gotipe/theme";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@gotipe/theme/page.css";

const SAMPLE =
  "# Editor\n\nUnicode: Привет 😀\n\n- [ ] Keyboard task\n\n```js\nconst value = 42;\n```\n";

function Consumer() {
  const [markdown, setMarkdown] = useState(SAMPLE);
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => setTheme(getTheme().mode), []);
  return (
    <main>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 12 }}>
        <ThemeToggle />
        <label>
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(event) => setReadOnly(event.target.checked)}
          />
          Read only
        </label>
      </header>
      <PageEditor markdown={markdown} onChange={setMarkdown} readOnly={readOnly} locale="en" />
      <output data-csp-markdown hidden>
        {markdown}
      </output>
    </main>
  );
}

document.body.style.margin = "0";
const root = document.getElementById("root");
if (!root) throw new Error("CSP test consumer root is missing");
createRoot(root).render(
  <StrictMode>
    <Consumer />
  </StrictMode>,
);
