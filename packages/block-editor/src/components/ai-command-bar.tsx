import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface AiCommandBarProps {
  editor: GoTipeEditor;
  onSubmit?: (prompt: string) => void | Promise<void>;
}

export function AiCommandBar({ editor, onSubmit }: AiCommandBarProps) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const submitted = useRef(false);
  const statusSeen = useRef(false);
  const errorSeen = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDialogElement>(null);

  const close = useCallback(
    (focus = false) => {
      generation.current++;
      if (submitted.current) editor.emit("executeAiCommand", { commandId: "cancelAi" });
      submitted.current = false;
      busyRef.current = false;
      setBusy(false);
      setVisible(false);
      setValue("");
      setError(null);
      if (focus && !editor.isDestroyed) editor.focus();
    },
    [editor],
  );

  useEffect(() => {
    alive.current = true;
    const status = editor.on("aiStatusChange", ({ active }) => {
      if (!submitted.current) return;
      statusSeen.current = true;
      busyRef.current = active;
      setBusy(active);
    });
    const failure = editor.on("error", (problem) => {
      if (!submitted.current || problem.details?.extension !== "ai") return;
      errorSeen.current = true;
      busyRef.current = false;
      setBusy(false);
      setError(problem.message);
    });
    const completed = () => {
      if (submitted.current && !busyRef.current && !errorSeen.current) close(true);
    };
    const update = editor.on("update", completed);
    const proofread = editor.on("aiProofreadChange", completed);
    const review = editor.on("commentAdded", completed);
    const editable = editor.on("editableChange", (enabled) => {
      if (!enabled) close();
    });
    const destroyed = editor.on("destroy", () => close());
    const command = editor.on("executeAiCommand", ({ commandId, prompt }) => {
      if (commandId === "askAi" && !prompt && editor.isEditable && !editor.isDestroyed)
        setVisible(true);
    });
    return () => {
      alive.current = false;
      generation.current++;
      if (submitted.current) editor.emit("executeAiCommand", { commandId: "cancelAi" });
      status();
      failure();
      update();
      proofread();
      review();
      editable();
      destroyed();
      command();
    };
  }, [editor, close]);

  useEffect(() => {
    const owner = editor.element?.ownerDocument ?? document;
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      const owned =
        target instanceof Node &&
        (editor.element?.contains(target) || barRef.current?.contains(target));
      if (!owned || event.isComposing || !editor.isEditable || editor.isDestroyed) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (visible) close(true);
        else setVisible(true);
      } else if (event.key === "Escape" && visible) {
        event.preventDefault();
        close(true);
      }
    };
    owner.addEventListener("keydown", keydown);
    return () => owner.removeEventListener("keydown", keydown);
  }, [editor, visible, close]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const owner = inputRef.current?.ownerDocument ?? document;
    const click = (event: MouseEvent) => {
      if (event.target instanceof Node && !barRef.current?.contains(event.target)) close();
    };
    owner.addEventListener("mousedown", click);
    return () => {
      cancelAnimationFrame(frame);
      owner.removeEventListener("mousedown", click);
    };
  }, [visible, close]);

  const submit = useCallback(async () => {
    const prompt = value.trim();
    if (!prompt || busyRef.current || editor.isDestroyed || !editor.isEditable) return;
    const current = ++generation.current;
    busyRef.current = true;
    submitted.current = true;
    statusSeen.current = false;
    errorSeen.current = false;
    setBusy(true);
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(prompt);
        if (alive.current && generation.current === current) close(true);
      } else {
        editor.emit("executeAiCommand", { commandId: "freeText", prompt });
        if (!statusSeen.current && !errorSeen.current) {
          throw new Error("AI is not available in this editor");
        }
      }
    } catch (failure) {
      if (alive.current && generation.current === current) {
        busyRef.current = false;
        setBusy(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    }
  }, [value, editor, onSubmit, close]);

  if (!visible) return null;
  return (
    <dialog
      open
      ref={barRef}
      className="gotipe-ai-command-bar"
      aria-label="AI command bar"
      aria-busy={busy}
      data-gotipe-ai-command-bar=""
      style={{ flexWrap: "wrap" }}
    >
      <span className="gotipe-ai-command-bar-icon" aria-hidden="true">
        ✨
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={busy}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder="Tell AI what to change..."
        aria-label="AI prompt"
      />
      <button
        type="button"
        className="gotipe-ai-command-bar-submit"
        onClick={() => void submit()}
        disabled={!value.trim() || busy}
        aria-label="Submit AI command"
      >
        ↵
      </button>
      <button
        type="button"
        className="gotipe-ai-command-bar-submit"
        onClick={() => close(true)}
        aria-label={busy ? "Cancel AI command" : "Close AI command bar"}
      >
        ×
      </button>
      {busy && (
        <output aria-live="polite" style={{ flexBasis: "100%", fontSize: "0.85em" }}>
          Processing...
        </output>
      )}
      {error && (
        <span
          role="alert"
          style={{
            flexBasis: "100%",
            overflowWrap: "anywhere",
            color: "var(--gt-danger, #b42318)",
            fontSize: "0.85em",
          }}
        >
          {error}
        </span>
      )}
    </dialog>
  );
}
