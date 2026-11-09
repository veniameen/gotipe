import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface AiCommandBarProps {
  editor: GoTipeEditor;
  onSubmit?: (prompt: string) => void;
}

export function AiCommandBar({ editor, onSubmit }: AiCommandBarProps) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Toggle with Mod-k
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setVisible((prev) => {
          const next = !prev;
          if (next) {
            // Focus after render
            requestAnimationFrame(() => inputRef.current?.focus());
          }
          return next;
        });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setVisible(false);
        setValue("");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      const bar = inputRef.current?.closest(".gotipe-ai-command-bar");
      if (bar && !bar.contains(e.target as Node)) {
        setVisible(false);
        setValue("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (onSubmit) {
      onSubmit(trimmed);
    } else {
      editor.emit("executeAiCommand", { commandId: "freeText", prompt: trimmed });
    }

    setValue("");
    setVisible(false);
  }, [value, editor, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!visible) return null;

  return (
    <div
      className="gotipe-ai-command-bar"
      role="dialog"
      aria-label="AI command bar"
      data-gotipe-ai-command-bar=""
    >
      <span className="gotipe-ai-command-bar-icon" aria-hidden="true">
        ✨
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Tell AI what to change..."
        aria-label="AI prompt"
      />
      <button
        type="button"
        className="gotipe-ai-command-bar-submit"
        onClick={handleSubmit}
        disabled={!value.trim()}
        aria-label="Submit AI command"
      >
        ↵
      </button>
    </div>
  );
}
