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
import type { AiProofreadSuggestion } from "@gotipe/ai";
import {
  AiStatusIndicator,
  FixedToolbar,
  GhostText,
  SuggestionToolbar,
  ThemeToggle,
} from "@gotipe/block-editor";
import type { Suggestion } from "@gotipe/block-editor";
import { FullPreset } from "@gotipe/core/presets";
import { Editor, MediaBlocksContext, useEditor } from "@gotipe/react";
import { mediaBlocks } from "@gotipe/react/media";
import { useCallback, useEffect, useState } from "react";
import { ExampleWrapper } from "../shared/example-wrapper";
import { mockAiProvider } from "../shared/mock-ai-provider";
import { AGENT_CONTENT } from "../shared/sample-content";

const AI_ACTIONS = [
  { id: "review", icon: "\uD83D\uDCAC", label: "Add AI comment", command: "review" },
  {
    id: "addParagraph",
    icon: "+",
    label: "Add new paragraph",
    command: "addParagraph",
    prompt: "about the topic",
  },
  { id: "proofread", icon: "Q", label: "Proofread", command: "proofread" },
  {
    id: "freeText",
    icon: "\u270E",
    label: "Adjust text selection",
    command: "freeText",
    prompt: "improve this text",
  },
  {
    id: "custom",
    icon: "\u223F",
    label: "Add custom component",
    command: "addParagraph",
    prompt: "add a custom component",
  },
  { id: "rewrite", icon: "\u25A3", label: "Justify edit", command: "rewrite" },
] as const;

export function AgentEditor() {
  const [prompt, setPrompt] = useState("");
  const [suggestions, setSuggestions] = useState<AiProofreadSuggestion[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const editor = useEditor({
    extensions: [
      FullPreset,
      defineAi.configure({ provider: mockAiProvider, enableAutoComplete: true }),
      defineAiContext.configure({ provider: mockAiProvider }),
      defineAiAgent.configure({ provider: mockAiProvider }),
    ],
    content: AGENT_CONTENT,
  });

  // Listen for proofread results
  useEffect(() => {
    if (!editor) return;
    const unsub = editor.on("aiStatusChange", () => {
      const sug = getProofreadSuggestions(editor);
      if (sug.length > 0) {
        setSuggestions([...sug]);
        setSuggestionIndex(0);
      }
    });
    return unsub;
  }, [editor]);

  const handleSubmit = useCallback(() => {
    const trimmed = prompt.trim();
    if (!trimmed || !editor) return;
    editor.emit("executeAiCommand", { commandId: "freeText", prompt: trimmed });
    setPrompt("");
  }, [prompt, editor]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleAcceptSuggestion = useCallback(
    (s: Suggestion) => {
      if (!editor) return;
      acceptProofreadSuggestion(editor, s.id);
      const remaining = getProofreadSuggestions(editor);
      setSuggestions(remaining);
      if (suggestionIndex >= remaining.length && remaining.length > 0) {
        setSuggestionIndex(remaining.length - 1);
      }
    },
    [editor, suggestionIndex],
  );

  const handleRejectSuggestion = useCallback(
    (s: Suggestion) => {
      if (!editor) return;
      rejectProofreadSuggestion(editor, s.id);
      const remaining = getProofreadSuggestions(editor);
      setSuggestions(remaining);
      if (suggestionIndex >= remaining.length && remaining.length > 0) {
        setSuggestionIndex(remaining.length - 1);
      }
    },
    [editor, suggestionIndex],
  );

  const handleAcceptAll = useCallback(() => {
    if (!editor) return;
    acceptAllProofreadSuggestions(editor);
    setSuggestions([]);
    setSuggestionIndex(0);
  }, [editor]);

  const handleRejectAll = useCallback(() => {
    if (!editor) return;
    rejectAllProofreadSuggestions(editor);
    setSuggestions([]);
    setSuggestionIndex(0);
  }, [editor]);

  return (
    <ExampleWrapper
      title="Agent Editor"
      description="AI-powered editor with proofread, review, text generation and streaming. Uses a mock AI provider for this demo."
      tags={["Commercial", "AI"]}
    >
      <div className="gotipe-agent-layout">
        {/* AI Actions sidebar */}
        <aside className="gotipe-agent-sidebar">
          <h3>AI Actions</h3>
          {AI_ACTIONS.map((action) => (
            <button
              type="button"
              key={action.id}
              className="gotipe-agent-action"
              onClick={() =>
                editor?.emit("executeAiCommand", {
                  commandId: action.command,
                  prompt: "prompt" in action ? action.prompt : undefined,
                })
              }
            >
              <span className="gotipe-agent-action-icon">{action.icon}</span>
              {action.label}
            </button>
          ))}

          <div className="gotipe-agent-sidebar-footer">
            <p>
              <strong>Local AI demo</strong>
            </p>
            <p>
              Responses use a local demo provider. Connect your own provider to use a model in your
              application. No external AI request is made by this demo.
            </p>
          </div>
        </aside>

        {/* Editor area: toolbar + editor + AI input */}
        <div className="gotipe-agent-editor-area" data-gotipe-block-editor="">
          {editor && (
            <FixedToolbar editor={editor}>
              <ThemeToggle />
            </FixedToolbar>
          )}
          <div className="gotipe-agent-editor-scroll">
            <MediaBlocksContext.Provider value={mediaBlocks}>
              <Editor editor={editor} />
            </MediaBlocksContext.Provider>
            {editor && <GhostText editor={editor} />}
          </div>

          {/* Proofread suggestion toolbar */}
          {editor && suggestions.length > 0 && (
            <SuggestionToolbar
              editor={editor}
              suggestions={suggestions as unknown as Suggestion[]}
              currentIndex={suggestionIndex}
              onNavigate={setSuggestionIndex}
              onAccept={handleAcceptSuggestion}
              onReject={handleRejectSuggestion}
              onAcceptAll={handleAcceptAll}
              onRejectAll={handleRejectAll}
            />
          )}

          {editor && <AiStatusIndicator editor={editor} />}

          {/* Always-visible AI command input */}
          <div className="gotipe-agent-ai-bar">
            <span className="gotipe-agent-ai-bar-icon" aria-hidden="true">
              {"\u2728"}
            </span>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell AI what else needs to be changed..."
              aria-label="AI prompt"
            />
            <button
              type="button"
              className="gotipe-agent-ai-bar-submit"
              onClick={handleSubmit}
              disabled={!prompt.trim()}
              aria-label="Submit AI command"
            >
              {"\u2191"}
            </button>
          </div>
        </div>
      </div>
    </ExampleWrapper>
  );
}
