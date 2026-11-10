import { useEffect, useState } from "react";
import { BlockEditorExample } from "./block-editor-example";
import { PageEditorExample } from "./page-editor-example";
import "./page-editor-example.css";

type EditorView = "page" | "block";
const currentView = (): EditorView =>
  new URLSearchParams(window.location.search).get("view") === "block" ? "block" : "page";

/** The same playground route demonstrates both public editor components. */
export function BasicExample() {
  const [view, setView] = useState(currentView);
  useEffect(() => {
    const sync = () => setView(currentView());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const select = (next: EditorView) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
    setView(next);
  };
  return (
    <div className="gotipe-basic-example">
      <label className="gotipe-editor-view">
        <span>Editor view</span>
        <select
          className="gotipe-select"
          value={view}
          onChange={(event) => select(event.target.value === "block" ? "block" : "page")}
        >
          <option value="page">Page</option>
          <option value="block">Block</option>
        </select>
      </label>
      {view === "page" ? <PageEditorExample /> : <BlockEditorExample />}
    </div>
  );
}
