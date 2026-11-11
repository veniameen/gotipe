import { BlockEditor } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import type { ThemePreset } from "@gotipe/theme";
import { useState } from "react";
import { ExampleWrapper } from "../shared/example-wrapper";
import { StaticToolbar } from "../shared/toolbar";
import { useDebugEditor } from "../shared/use-debug-editor";
import { ATLAS_DOCUMENT } from "./views/document";

const VIEWS: ThemePreset[] = ["notion", "docs", "modern", "minimal"];

/** One document in the four views of the GoTipe Atlas (frames 1–5). */
export function ViewsExample() {
  const editor = useEditor({ extensions: [FullPreset], content: ATLAS_DOCUMENT });
  const [view, setView] = useState<ThemePreset>("notion");
  useDebugEditor("__GOTIPE_VIEWS_EDITOR__", editor);

  return (
    <ExampleWrapper
      title="Views"
      description="The same document in the four views of the GoTipe Atlas. A view is a set of --gt-* tokens over one markup: the BlockEditor view prop sets data-gt-view."
      tags={["Commercial"]}
    >
      <fieldset className="gotipe-example-actions">
        <legend>View</legend>
        {VIEWS.map((name) => (
          <button
            key={name}
            type="button"
            className="gotipe-example-button"
            aria-pressed={view === name}
            onClick={() => setView(name)}
          >
            {name}
          </button>
        ))}
      </fieldset>
      <div className="gotipe-views-frame" data-gt-view={view}>
        {view === "modern" && editor && <StaticToolbar editor={editor} />}
        <BlockEditor editor={editor} view={view} showAiCommandBar={false} />
      </div>
    </ExampleWrapper>
  );
}
