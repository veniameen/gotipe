import {
  acceptAllProofreadSuggestions,
  acceptProofreadSuggestion,
  defineAi,
  defineAiAgent,
  defineAiContext,
  getProofreadSuggestions,
  rejectAllProofreadSuggestions,
  rejectProofreadSuggestion,
} from "@gotipe/ai";
import type { AiProofreadSuggestion, AiProvider } from "@gotipe/ai";
import { BlockEditor } from "@gotipe/block-editor";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useCallback, useEffect, useState } from "react";
import { ExampleWrapper } from "../shared/example-wrapper";
import { mockAiProvider } from "../shared/mock-ai-provider";
import { useDebugEditor } from "../shared/use-debug-editor";

declare global {
  interface Window {
    __GOTIPE_AI_PROVIDER__?: AiProvider;
  }
}

const AI_CONTENT = {
  version: 1,
  blocks: [
    {
      id: "ai-b1",
      type: "heading",
      attrs: { level: 1 },
      content: [{ text: "AI Features Demo", marks: [] }],
      children: [],
    },
    {
      id: "ai-b2",
      type: "paragraph",
      attrs: {},
      content: [
        { text: "This demo shows all three levels of GoTipe AI integration. ", marks: [] },
        {
          text: "Start typing and pause to see ghost text suggestions.",
          marks: [{ type: "bold", attrs: {} }],
        },
      ],
      children: [],
    },
    {
      id: "ai-b3",
      type: "heading",
      attrs: { level: 2 },
      content: [{ text: "How to use", marks: [] }],
      children: [],
    },
    {
      id: "ai-b4",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        {
          id: "ai-b4-1",
          type: "listItem",
          attrs: {},
          content: [
            { text: "Ghost Text: ", marks: [{ type: "bold", attrs: {} }] },
            { text: "Type something and pause \u2014 AI suggests completion. Press ", marks: [] },
            { text: "Tab", marks: [{ type: "code", attrs: {} }] },
            { text: " to accept, ", marks: [] },
            { text: "Escape", marks: [{ type: "code", attrs: {} }] },
            { text: " to dismiss.", marks: [] },
          ],
          children: [],
        },
        {
          id: "ai-b4-2",
          type: "listItem",
          attrs: {},
          content: [
            { text: "Improve: ", marks: [{ type: "bold", attrs: {} }] },
            { text: "Select text \u2192 Bubble Menu \u2192 \u2728 Improve", marks: [] },
          ],
          children: [],
        },
        {
          id: "ai-b4-3",
          type: "listItem",
          attrs: {},
          content: [
            { text: "Continue Writing: ", marks: [{ type: "bold", attrs: {} }] },
            { text: "Type ", marks: [] },
            { text: "/continue", marks: [{ type: "code", attrs: {} }] },
            { text: " in the slash menu", marks: [] },
          ],
          children: [],
        },
        {
          id: "ai-b4-4",
          type: "listItem",
          attrs: {},
          content: [
            { text: "AI Command Bar: ", marks: [{ type: "bold", attrs: {} }] },
            { text: "Press ", marks: [] },
            { text: "Cmd+J", marks: [{ type: "code", attrs: {} }] },
            { text: " to type a free-text AI prompt", marks: [] },
          ],
          children: [],
        },
      ],
    },
    {
      id: "ai-b5",
      type: "paragraph",
      attrs: {},
      content: [
        {
          text: "The specific details of the implementation are to be determined based on the architecture review.",
          marks: [],
        },
      ],
      children: [],
    },
    {
      id: "ai-b6",
      type: "paragraph",
      attrs: {},
      content: [
        {
          text: "Try typing here and pausing to see ghost text suggestions appear...",
          marks: [{ type: "italic", attrs: {} }],
        },
      ],
      children: [],
    },
  ],
};

export function AIExample() {
  const [suggestions, setSuggestions] = useState<AiProofreadSuggestion[]>([]);

  const editor = useEditor({
    extensions: [
      DefaultPreset,
      defineAi.configure({ provider: mockAiProvider, enableAutoComplete: true, debounceMs: 800 }),
      defineAiContext.configure({ provider: mockAiProvider }),
      defineAiAgent.configure({ provider: mockAiProvider }),
    ],
    content: AI_CONTENT,
  });

  useDebugEditor("__GOTIPE_EDITOR__", editor);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__GOTIPE_AI_PROVIDER__ = mockAiProvider;
    return () => {
      if (window.__GOTIPE_AI_PROVIDER__ === mockAiProvider)
        window.__GOTIPE_AI_PROVIDER__ = undefined;
    };
  }, []);

  // Listen for proofread results
  useEffect(() => {
    if (!editor) return;
    const unsub = editor.on("aiStatusChange", () => {
      const sug = getProofreadSuggestions(editor);
      setSuggestions([...sug]);
    });
    return unsub;
  }, [editor]);

  const handleAccept = useCallback(
    (s: { id: string }) => {
      if (!editor) return;
      acceptProofreadSuggestion(editor, s.id);
      setSuggestions(getProofreadSuggestions(editor));
    },
    [editor],
  );

  const handleReject = useCallback(
    (s: { id: string }) => {
      if (!editor) return;
      rejectProofreadSuggestion(editor, s.id);
      setSuggestions(getProofreadSuggestions(editor));
    },
    [editor],
  );

  const handleAcceptAll = useCallback(() => {
    if (!editor) return;
    acceptAllProofreadSuggestions(editor);
    setSuggestions([]);
  }, [editor]);

  const handleRejectAll = useCallback(() => {
    if (!editor) return;
    rejectAllProofreadSuggestions(editor);
    setSuggestions([]);
  }, [editor]);

  return (
    <div data-gotipe-example="ai">
      <ExampleWrapper
        title="AI Features"
        description="Ghost text autocomplete, AI Improve, Continue Writing, Proofread, and AI Command Bar. Uses a mock AI provider."
        tags={["MIT", "AI"]}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            className="gotipe-example-button"
            onClick={() => editor?.emit("executeAiCommand", { commandId: "proofread" })}
          >
            Proofread
          </button>
          <button
            type="button"
            className="gotipe-example-button"
            onClick={() => editor?.emit("executeAiCommand", { commandId: "review" })}
          >
            AI Review
          </button>
          <button
            type="button"
            className="gotipe-example-button"
            onClick={() =>
              editor?.emit("executeAiCommand", {
                commandId: "addParagraph",
                prompt: "about AI in document editing",
              })
            }
          >
            + AI Paragraph
          </button>
        </div>

        <BlockEditor
          editor={editor}
          showAiCommandBar={true}
          showThemeToggle={false}
          suggestions={suggestions}
          onSuggestionAccept={handleAccept}
          onSuggestionReject={handleReject}
          onSuggestionAcceptAll={handleAcceptAll}
          onSuggestionRejectAll={handleRejectAll}
        />
      </ExampleWrapper>
    </div>
  );
}
