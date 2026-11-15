import type { GoTipeEditor } from "@gotipe/core";
import { assertWritable } from "./document";

export interface AiRequest {
  signal: AbortSignal;
  check(): void;
  finish(): void;
}
export function cancelled(): Error {
  const error = new Error("AI request was cancelled");
  error.name = "AbortError";
  return error;
}
/**
 * Owns one current provider operation; superseded completions cannot clear its status. A
 * local edit cancels it: the result was asked for the document before the edit. Another
 * replica's edit does not: the result checks the blocks it applies to (`AiTarget`).
 */
export class AiRequests {
  private current: AbortController | null = null;
  private destroyed = false;
  private cleanup: (() => void)[];
  constructor(private editor: GoTipeEditor) {
    this.cleanup = [
      // Only this replica's edits end the request; another replica's do not (D-46).
      editor.on("update", ({ origin }) => {
        if (origin === "local") this.cancel();
      }),
      editor.on("editableChange", (editable) => {
        if (!editable) this.cancel();
      }),
      editor.on("destroy", () => this.destroy()),
    ];
  }
  get processing(): boolean {
    return this.current !== null;
  }
  start(label: string, signal?: AbortSignal): AiRequest {
    assertWritable(this.editor);
    if (this.destroyed) throw new Error("AI manager has been destroyed");
    this.cancel();
    const controller = new AbortController();
    this.current = controller;
    const abort = () => {
      controller.abort();
      if (this.current === controller) this.finish(controller);
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    else this.editor.emit("aiStatusChange", { active: true, label });
    return {
      signal: controller.signal,
      check: () => {
        if (
          this.destroyed ||
          this.editor.isDestroyed ||
          !this.editor.isEditable ||
          controller.signal.aborted ||
          this.current !== controller
        ) {
          throw cancelled();
        }
      },
      finish: () => {
        signal?.removeEventListener("abort", abort);
        this.finish(controller);
      },
    };
  }
  private finish(controller: AbortController): void {
    if (this.current !== controller) return;
    this.current = null;
    if (!this.destroyed && !this.editor.isDestroyed)
      this.editor.emit("aiStatusChange", { active: false });
  }
  cancel(): void {
    const current = this.current;
    if (!current) return;
    current.abort();
    this.finish(current);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.current?.abort();
    this.current = null;
    for (const cleanup of this.cleanup) cleanup();
    this.cleanup = [];
  }
}
