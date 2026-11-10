import {
  type AiCommand,
  AiManager,
  type AiSuggestion,
  buildAiContext,
  captureAiTarget,
} from "@gotipe/ai";
import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface AiCommandPaletteProps {
  editor: GoTipeEditor;
  commands: AiCommand[];
  onClose: () => void;
}

export function AiCommandPalette({ editor, commands, onClose }: AiCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [editable, setEditable] = useState(editor.isEditable);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const busy = useRef(false);
  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const session = useMemo(() => {
    return { target: captureAiTarget(editor), context: buildAiContext(editor) };
  }, [editor]);
  useEffect(() => {
    alive.current = true;
    const stop = () => pending.current?.abort();
    setEditable(editor.isEditable);
    const off = editor.on("destroy", () => {
      stop();
      setEditable(false);
    });
    const offEditable = editor.on("editableChange", (value) => {
      setEditable(value);
      if (!value) stop();
    });
    return () => {
      alive.current = false;
      stop();
      off();
      offEditable();
    };
  }, [editor]);

  const filtered = commands.filter((command) =>
    `${command.name} ${command.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const handleSelect = useCallback(
    async (command: AiCommand) => {
      if (busy.current || !editor.isEditable || editor.isDestroyed) return;
      busy.current = true;
      const controller = new AbortController();
      pending.current = controller;
      setLoading(true);
      setError(null);
      try {
        const result = await command.execute(editor, {
          ...session.context,
          signal: controller.signal,
        });
        if (!alive.current || controller.signal.aborted) return;
        if (result.length) setSuggestions(result);
        else onClose();
      } catch (failure) {
        if (alive.current && !controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (pending.current === controller) {
          busy.current = false;
          if (alive.current) setLoading(false);
        }
      }
    },
    [editor, onClose, session],
  );
  const apply = (suggestion: AiSuggestion) => {
    const manager = new AiManager(editor, {});
    try {
      manager.applySuggestion(suggestion, session.target);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      manager.destroy();
    }
  };

  return (
    <dialog
      className="gotipe-ai-command-palette"
      aria-label="AI Commands"
      aria-busy={loading}
      open
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ask AI..."
        aria-label="Search AI commands"
        disabled={loading}
        onKeyDown={(event) => {
          if (event.key === "Enter" && filtered[0] && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void handleSelect(filtered[0]);
          }
        }}
      />
      {loading && (
        <output className="gotipe-ai-loading" aria-live="polite">
          Processing...
        </output>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="gotipe-ai-commands-list">
        {suggestions.length
          ? suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.id}
                onClick={() => apply(suggestion)}
                disabled={!editable}
              >
                {suggestion.content}
              </button>
            ))
          : filtered.map((command) => (
              <button
                type="button"
                key={command.name}
                className="gotipe-ai-command-item"
                disabled={loading || !editable}
                onClick={() => void handleSelect(command)}
              >
                <span>{command.name}</span>
                <span style={{ color: "var(--gt-text-muted)", fontSize: "0.85em" }}>
                  {command.description}
                </span>
              </button>
            ))}
        {!suggestions.length && !filtered.length && <p>No matching commands</p>}
      </div>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}
