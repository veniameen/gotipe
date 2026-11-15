import {
  type AiCommand,
  AiManager,
  type AiSuggestion,
  buildAiContext,
  captureAiTarget,
} from "@gotipe/ai";
import type { GoTipeEditor } from "@gotipe/core";
import { useGoTipeI18n } from "@gotipe/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface AiCommandPaletteProps {
  editor: GoTipeEditor;
  commands: AiCommand[];
  onClose: () => void;
}

/** Its words come from `GoTipeI18nProvider` (`@gotipe/react`), English without one. */
export function AiCommandPalette({ editor, commands, onClose }: AiCommandPaletteProps) {
  const i18n = useGoTipeI18n();
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
      aria-label={i18n.t("ai.commands")}
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
        placeholder={i18n.t("ai.ask")}
        aria-label={i18n.t("ai.searchCommands")}
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
          {i18n.t("ai.running")}
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
        {!suggestions.length && !filtered.length && <p>{i18n.t("ai.noCommands")}</p>}
      </div>
      <button type="button" onClick={onClose}>
        {i18n.t("ai.closeCommands")}
      </button>
    </dialog>
  );
}
