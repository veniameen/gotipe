import {
  type AiProofreadSuggestion,
  acceptAllProofreadSuggestions,
  acceptProofreadSuggestion,
  defineAi,
  defineAiAgent,
  defineAiContext,
  getProofreadSuggestions,
  rejectAllProofreadSuggestions,
  rejectProofreadSuggestion,
} from "@gotipe/ai";
import { BlockEditor } from "@gotipe/block-editor";
import type { GoTipeEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useEffect, useState } from "react";
import { documentOf, text } from "../frame/content";
import { DemoTools, ToolButton } from "../frame/tools";
import { demoProvider } from "./demo-provider";
import "../frame/editor-styles";

const DOCUMENT = documentOf("ai", (b) => [
  b.heading(3, "Weekly update"),
  b.paragraph(text("The launch date is to be decided, and the docs are very nearly done.")),
  b.paragraph(text("Next week we")),
]);

export function AiDemo() {
  const editor = useEditor({
    engine: "js",
    extensions: [
      DefaultPreset,
      defineAi.configure({ provider: demoProvider, enableAutoComplete: true, debounceMs: 700 }),
      defineAiContext.configure({ provider: demoProvider }),
      defineAiAgent.configure({ provider: demoProvider }),
    ],
    content: DOCUMENT,
  });
  const [items, setItems] = useState<AiProofreadSuggestion[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editor) return;
    const read = () => setItems(getProofreadSuggestions(editor));
    const stops = [editor.on("aiProofreadChange", read), editor.on("aiStatusChange", read)];
    return () => {
      for (const stop of stops) stop();
    };
  }, [editor]);

  // Accepting a stale suggestion throws; proofread again in that case.
  const run = (action: (editor: GoTipeEditor) => void) => {
    if (!editor) return;
    try {
      action(editor);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    setItems(getProofreadSuggestions(editor));
  };
  const command = (commandId: string, prompt?: string) =>
    editor?.emit("executeAiCommand", { commandId, prompt });

  return (
    <>
      <DemoTools label="AI">
        <ToolButton disabled={!editor} onClick={() => command("addParagraph", "the launch")}>
          Write a paragraph
        </ToolButton>
        <ToolButton disabled={!editor} onClick={() => command("rewrite")}>
          Improve selection
        </ToolButton>
        <ToolButton disabled={!editor} onClick={() => command("proofread")}>
          Proofread
        </ToolButton>
        <span className="site-demo-note" role={error ? "alert" : "status"}>
          {error}
        </span>
      </DemoTools>
      <div className="site-demo-scroll">
        <BlockEditor
          editor={editor}
          ariaLabel="Weekly update"
          suggestions={items}
          onSuggestionAccept={(s) => run((ed) => acceptProofreadSuggestion(ed, s.id))}
          onSuggestionReject={(s) => run((ed) => rejectProofreadSuggestion(ed, s.id))}
          onSuggestionAcceptAll={() => run((ed) => acceptAllProofreadSuggestions(ed))}
          onSuggestionRejectAll={() => run((ed) => rejectAllProofreadSuggestions(ed))}
        />
      </div>
    </>
  );
}
