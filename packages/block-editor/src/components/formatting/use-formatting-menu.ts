import { type GoTipeEditor, GoTipeError, type Selection } from "@gotipe/core";
import { useFloatingPosition } from "@gotipe/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { capturedSelection } from "./selection";

/**
 * Owns a formatting popup, its captured selection and dismissal lifetime. Escape returns the keys
 * to the popup's button; a popup with a text field (`returnTo: "text"`) gives them back to the
 * text with the selection it was opened on, so typing goes on.
 */
export function useFormattingMenu(
  editor: GoTipeEditor,
  { returnTo = "trigger" }: { returnTo?: "trigger" | "text" } = {},
) {
  const [open, setOpen] = useState(false);
  const [editable, setEditable] = useState(editor.isEditable);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const selection = useRef<Selection | null>(null);
  const anchor = useCallback(() => trigger.current?.getBoundingClientRect() ?? null, []);
  const position = useFloatingPosition({
    open,
    anchor,
    element: popup,
    placement: "bottom-start",
    gap: 6,
  });
  const close = useCallback(
    (returnFocus = false) => {
      setOpen(false);
      if (!returnFocus) return;
      if (returnTo === "text" && selection.current && !editor.isDestroyed)
        editor.chain().setSelection(selection.current).focus().run();
      else trigger.current?.focus();
    },
    [editor, returnTo],
  );
  const show = useCallback(() => {
    if (!editor.isEditable || editor.isDestroyed) return;
    selection.current = capturedSelection(editor.getViewState().selection);
    setError(null);
    setOpen(true);
  }, [editor]);
  useEffect(() => {
    setEditable(editor.isEditable);
    const changed = editor.on("update", () => close());
    const mode = editor.on("editableChange", (value) => {
      setEditable(value);
      if (!value) close();
    });
    const destroyed = editor.on("destroy", () => {
      setEditable(false);
      close();
    });
    return () => {
      changed();
      mode();
      destroyed();
    };
  }, [editor, close]);
  useEffect(() => {
    if (!open) return;
    const owner = trigger.current?.ownerDocument ?? document;
    const outside = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !popup.current?.contains(event.target)
      )
        close();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    const frame = requestAnimationFrame(() =>
      popup.current?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus(),
    );
    owner.addEventListener("mousedown", outside);
    owner.addEventListener("keydown", escape);
    return () => {
      cancelAnimationFrame(frame);
      owner.removeEventListener("mousedown", outside);
      owner.removeEventListener("keydown", escape);
    };
  }, [open, close]);
  const keydown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (!(event.target instanceof HTMLButtonElement)) return;
    const buttons = Array.from(
      popup.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    const index = buttons.indexOf(event.target);
    const delta =
      event.key === "ArrowDown" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp" || event.key === "ArrowLeft"
          ? -1
          : 0;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : delta
            ? (index + delta + buttons.length) % buttons.length
            : -1;
    if (next >= 0) {
      event.preventDefault();
      buttons[next]?.focus();
    }
  };
  const run = (command: (chain: ReturnType<GoTipeEditor["chain"]>) => void) => {
    if (!editor.isEditable || editor.isDestroyed || !selection.current) return;
    try {
      const chain = editor.chain().setSelection(selection.current);
      command(chain);
      if (!chain.focus().run()) throw new Error("The editor declined the formatting change");
      close();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      setError(message);
      editor.reportError(new GoTipeError("TRANSFORM_ERROR", message));
    }
  };
  return {
    open,
    editable,
    error,
    setError,
    trigger,
    popup,
    selection,
    show,
    close,
    run,
    keydown,
    style: {
      ...position,
      position: "fixed" as const,
      visibility: position ? ("visible" as const) : ("hidden" as const),
      margin: 0,
      right: "auto",
      bottom: "auto",
      animation: "none",
      overflow: "auto",
      zIndex: 70,
    },
  };
}
