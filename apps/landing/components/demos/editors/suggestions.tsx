import { BlockEditor, type ToolbarSuggestion as ToolbarItem } from "@gotipe/block-editor";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { type Suggestion, SuggestionsManager } from "@gotipe/suggestions";
import { useEffect, useState } from "react";
import { documentOf, text } from "../frame/content";
import { DemoTools, ToolButton } from "../frame/tools";
import "../frame/editor-styles";

const DOCUMENT = documentOf("suggestions", (b) => [
  b.heading(3, "Pricing"),
  b.paragraph(text("The free plan includes three editors and unlimited documents.")),
  b.paragraph(text("Teams pay per editor, billed monthly.")),
]);

// The toolbar steps through text changes; Accept all and Reject all cover every kind.
const toToolbar = (records: Suggestion[]): ToolbarItem[] =>
  records.flatMap((s) =>
    s.type === "insert" || s.type === "delete" || s.type === "replace"
      ? [
          {
            id: s.id,
            type: s.type,
            blockId: s.blockId,
            from: s.from,
            to: s.to,
            originalText: s.originalContent ?? "",
            suggestedText: s.newContent ?? "",
          },
        ]
      : [],
  );

export function SuggestionsDemo() {
  const editor = useEditor({ engine: "js", extensions: [DefaultPreset], content: DOCUMENT });
  const [manager, setManager] = useState<SuggestionsManager | null>(null);
  const [pending, setPending] = useState<Suggestion[]>([]);
  const [tracking, setTracking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editor) return;
    const next = new SuggestionsManager(editor, {
      enabled: true,
      authorId: "you",
      authorName: "You",
    });
    const stop = next.subscribe(() => {
      setPending(next.getPendingSuggestions());
      setTracking(next.getState() === "tracking");
    });
    setManager(next);
    return () => {
      stop();
      next.destroy();
    };
  }, [editor]);

  // Accept and Reject throw when a change can no longer be applied.
  const run = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const count = pending.length;

  return (
    <>
      <DemoTools label="Track changes">
        <ToolButton
          disabled={!manager}
          pressed={tracking}
          onClick={() =>
            run(() => {
              if (tracking) manager?.disable();
              else manager?.enable();
              setTracking(!tracking);
            })
          }
        >
          Suggesting
        </ToolButton>
        <ToolButton disabled={!count} onClick={() => run(() => manager?.acceptAll())}>
          Accept all
        </ToolButton>
        <ToolButton disabled={!count} onClick={() => run(() => manager?.rejectAll())}>
          Reject all
        </ToolButton>
        <span className="site-demo-note" role={error ? "alert" : "status"}>
          {error || `${count} pending ${count === 1 ? "change" : "changes"}`}
        </span>
      </DemoTools>
      <div className="site-demo-scroll">
        <BlockEditor
          editor={editor}
          showAiCommandBar={false}
          ariaLabel="Pricing page"
          suggestions={toToolbar(pending)}
          onSuggestionAccept={(s) => run(() => manager?.acceptSuggestion(s.id))}
          onSuggestionReject={(s) => run(() => manager?.rejectSuggestion(s.id))}
          onSuggestionAcceptAll={() => run(() => manager?.acceptAll())}
          onSuggestionRejectAll={() => run(() => manager?.rejectAll())}
        />
      </div>
    </>
  );
}
