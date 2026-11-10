import { saveAsset } from "../assets";
import { GoTipeError } from "../error";
import { blocksToHtml, spansToHtml } from "../serialization/html";
import { blocksToText } from "../text";
import type { Block, Document } from "../types/block";
import type { GoTipeEditor } from "../types/editor";
import { documentTransaction } from "./document";
import { insertPayload, plainTextPayload } from "./insertion";
import { type ClipboardOptions, findPasteRule, runPasteRules } from "./paste-rules";
import { readClipboardPayload } from "./payload";
import { type ClipboardPayload, copySelection, removeSelection } from "./selection";

export class ClipboardHandler {
  private request = 0;
  private disposed = false;

  private drafts = new Set<GoTipeEditor>();

  constructor(
    private editor: GoTipeEditor,
    private options: ClipboardOptions = {},
  ) {}

  destroy(): void {
    this.disposed = true;
    this.request++;
    for (const draft of this.drafts) draft.destroy();
    this.drafts.clear();
  }

  onPaste(event: ClipboardEvent): void {
    if (!this.editor.isEditable || this.disposed) return;
    this.editor.syncSelectionFromDOM();
    this.request++;
    event.preventDefault();
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length) {
      void this.pasteFiles(files);
      return;
    }
    try {
      const text = event.clipboardData?.getData("text/plain");
      if (text && !event.clipboardData?.getData("application/x-gotipe") && this.hasRule(text)) {
        void this.pasteUsingRules([text]);
        return;
      }
      const payload = event.clipboardData && readClipboardPayload(event.clipboardData);
      if (payload) this.apply(payload);
      else this.pasteFromSystemClipboard();
    } catch (error) {
      this.report(error);
    }
  }

  /** The native paste event owns insertion; a timer fallback can duplicate a delayed event. */
  onPasteShortcut(): void {
    this.request++;
  }

  onDrop(event: DragEvent): void {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length || this.disposed || !this.editor.isEditable) return;
    event.preventDefault();
    const document = this.editor.element?.ownerDocument;
    if (document) {
      const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (range && this.editor.element?.contains(range.startContainer)) {
        const selection = document.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    this.editor.syncSelectionFromDOM();
    void this.pasteFiles(files);
  }

  private hasRule(data: File | string): boolean {
    return !!this.options.createDraft && !!findPasteRule(this.options, data);
  }

  private async savedFile(file: File): Promise<Block> {
    const kind = file.type.startsWith("image/") ? "image" : "file";
    const saved = await saveAsset(this.editor.host, file, kind);
    return {
      id: crypto.randomUUID(),
      type: kind,
      content: null,
      children: [],
      attrs:
        kind === "image"
          ? { src: saved.src, alt: saved.name, caption: "" }
          : { url: saved.src, name: saved.name, size: file.size, mime_type: file.type },
    };
  }

  private async pasteUsingRules(data: (File | string)[]): Promise<void> {
    const request = ++this.request;
    const before = this.editor.getJSON();
    const selection = structuredClone(this.editor.getViewState().selection);
    const snapshot = JSON.stringify({ document: before, selection });
    const current = () =>
      !this.disposed &&
      !this.editor.isDestroyed &&
      this.editor.isEditable &&
      request === this.request;
    try {
      const result = await runPasteRules(
        this.options,
        data,
        before,
        selection,
        current,
        this.drafts,
        async (file) => ({ blocks: [await this.savedFile(file)] }),
      );
      if (!result || !current()) return;
      if (
        snapshot !==
        JSON.stringify({
          document: this.editor.getJSON(),
          selection: this.editor.getViewState().selection,
        })
      )
        throw new GoTipeError(
          "CLIPBOARD_FAILED",
          "The document or selection changed during paste. Paste again at the desired position.",
        );
      if (!this.editor.validate(result.document))
        throw new GoTipeError(
          "CLIPBOARD_FAILED",
          "The paste rule produced content outside the editor schema",
        );
      const transaction = documentTransaction(before, result.document, result.selection.head);
      if (transaction.steps.length) this.editor.dispatch(transaction);
    } catch (error) {
      if (current()) this.report(error);
    }
  }

  private async pasteFiles(files: File[]): Promise<void> {
    if (files.some((file) => this.hasRule(file))) {
      await this.pasteUsingRules(files);
      return;
    }
    const request = ++this.request;
    const snapshot = JSON.stringify({
      document: this.editor.getJSON(),
      selection: this.editor.getViewState().selection,
    });
    try {
      const blocks = await Promise.all(files.map((file) => this.savedFile(file)));
      if (
        this.disposed ||
        this.editor.isDestroyed ||
        !this.editor.isEditable ||
        request !== this.request
      )
        return;
      const current = JSON.stringify({
        document: this.editor.getJSON(),
        selection: this.editor.getViewState().selection,
      });
      if (snapshot !== current)
        throw new GoTipeError(
          "ASSET_SAVE_FAILED",
          "The document changed during upload. Insert the file again at the desired position.",
        );
      this.apply({ blocks });
    } catch (error) {
      if (!this.disposed && !this.editor.isDestroyed && request === this.request)
        this.report(error);
    }
  }

  canReadClipboardText(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";
  }

  pasteFromSystemClipboard(): void {
    if (!this.canReadClipboardText() || this.disposed || !this.editor.isEditable) return;
    this.editor.syncSelectionFromDOM();
    const request = ++this.request;
    const snapshot = JSON.stringify({
      document: this.editor.getJSON(),
      selection: this.editor.getViewState().selection,
    });
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (
          !text ||
          this.disposed ||
          this.editor.isDestroyed ||
          !this.editor.isEditable ||
          request !== this.request
        )
          return;
        const current = JSON.stringify({
          document: this.editor.getJSON(),
          selection: this.editor.getViewState().selection,
        });
        if (snapshot !== current) return; // A late clipboard response must not replace a newer edit/selection.
        if (this.hasRule(text)) void this.pasteUsingRules([text]);
        else this.apply(plainTextPayload(text));
      })
      .catch((error) => {
        if (!this.disposed && request === this.request) this.report(error);
      });
  }

  onCopy(event: ClipboardEvent): void {
    if (this.disposed) return;
    this.editor.syncSelectionFromDOM();
    this.writeSelection(event);
  }

  onCut(event: ClipboardEvent): void {
    if (this.disposed) return;
    this.editor.syncSelectionFromDOM();
    // Never delete unless all clipboard formats were successfully written.
    if (!this.writeSelection(event) || !this.editor.isEditable) return;
    const document = this.editor.getJSON() as Document;
    const plan = removeSelection(document, this.editor.getViewState().selection);
    if (!plan) return;
    try {
      this.editor.dispatch(documentTransaction(document, plan.document, plan.caret));
    } catch (error) {
      this.report(error);
    }
  }

  private writeSelection(event: ClipboardEvent): boolean {
    const data = event.clipboardData;
    if (!data) return false;
    const payload = copySelection(
      this.editor.getJSON() as Document,
      this.editor.getViewState().selection,
    );
    if (!payload) return false;
    try {
      const plain =
        "spans" in payload
          ? payload.spans.map((span) => span.text).join("")
          : blocksToText(payload.blocks);
      const html = "spans" in payload ? spansToHtml(payload.spans) : blocksToHtml(payload.blocks);
      data.setData("text/plain", plain);
      data.setData("text/html", html);
      data.setData("application/x-gotipe", JSON.stringify(payload));
      event.preventDefault();
      return true;
    } catch (error) {
      event.preventDefault();
      this.report(error);
      return false;
    }
  }

  private apply(payload: ClipboardPayload): void {
    const document = this.editor.getJSON() as Document;
    const plan = insertPayload(document, this.editor.getViewState().selection, payload);
    if (!this.editor.validate(plan.document)) {
      throw new GoTipeError(
        "CLIPBOARD_FAILED",
        "The pasted content does not match the editor schema",
      );
    }
    const transaction = documentTransaction(document, plan.document, plan.caret);
    if (transaction.steps.length) this.editor.dispatch(transaction);
  }

  private report(error: unknown): void {
    this.editor.reportError(
      error instanceof GoTipeError
        ? error
        : new GoTipeError(
            "CLIPBOARD_FAILED",
            error instanceof Error ? error.message : "Clipboard operation failed",
          ),
    );
  }
}
