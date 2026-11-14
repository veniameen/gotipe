import { documentTransaction, entries } from "../clipboard/document";
import { insertPayload } from "../clipboard/insertion";
import { cloneAttributes } from "../document/attributes";
import { ownsInputTarget } from "../dom/input-owner";
import { createTextWalker } from "../dom/text-walker";
import { atomAt, viewAtoms } from "../engine/atoms";
import { GoTipeError } from "../error";
import { isUtf16Boundary } from "../text";
import type { Document } from "../types/block";
import { captureCompositionDOM } from "./composition-dom";
import { installCompositionInterruption } from "./composition-interruption";

interface Position {
  blockId: string;
  offset: number;
}
interface Selection {
  anchor: Position;
  head: Position;
}
interface ComposingBlock {
  type: string;
  /** View spans; atomic marks carry `atomic: true`. */
  content: { text: string; marks?: { atomic?: true }[] }[] | string | null;
}

export interface CompositionPort {
  isEditable(): boolean;
  /** Flush a pending renderer caret restore before native IME takes ownership. */
  prepareSelection(): Selection;
  getBlock(id: string): ComposingBlock | null;
  getDocument(): Document;
  restoreSelection(): void;
  getMarks(id: string, offset: number): { type: string; attrs: Record<string, unknown> }[];
  commit(steps: unknown[], caret: Position): void;
  reportError(error: GoTipeError): void;
}

function textHost(block: Element): Element {
  const type = block.getAttribute("data-block-type");
  if (type === "todoItem") return block.querySelector("[data-gotipe-todo-content]") ?? block;
  if (type === "callout") return block.querySelector(".gotipe-callout-content") ?? block;
  return block;
}

function ownText(block: Element, blockId: string): string {
  const walker = createTextWalker(textHost(block));
  let text = "";
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const owner = node.parentElement?.closest("[data-block-id]")?.getAttribute("data-block-id");
    if (!owner || owner === blockId) text += node.nodeValue ?? "";
  }
  return text;
}

/** Minimal native text replacement, keeping Unicode scalar boundaries intact. */
export function compositionChange(
  model: string,
  dom: string,
): { from: number; to: number; text: string } {
  let prefix = 0;
  const length = Math.min(model.length, dom.length);
  while (prefix < length && model.charCodeAt(prefix) === dom.charCodeAt(prefix)) prefix++;
  while (!isUtf16Boundary(model, prefix) || !isUtf16Boundary(dom, prefix)) prefix--;
  let suffix = 0;
  while (
    suffix < length - prefix &&
    model.charCodeAt(model.length - 1 - suffix) === dom.charCodeAt(dom.length - 1 - suffix)
  )
    suffix++;
  while (
    !isUtf16Boundary(model, model.length - suffix) ||
    !isUtf16Boundary(dom, dom.length - suffix)
  )
    suffix--;
  return { from: prefix, to: model.length - suffix, text: dom.slice(prefix, dom.length - suffix) };
}

/** Native IME owns the DOM between start/end; one transaction owns its final change. */
export function installComposition(
  element: HTMLElement,
  signal: AbortSignal,
  port: CompositionPort,
): {
  readonly blockId: string | null;
  interrupt(reason: string): void;
  deferPresentation(key: string, apply: () => void): boolean;
} {
  let active: {
    blockId: string;
    selection: Selection;
    document: Document;
    text: string | null;
    restoreDOM(): void;
  } | null = null;
  const interruption = installCompositionInterruption(element, signal, port);
  const presentation = new Map<string, () => void>();
  const flushPresentation = () => {
    const pending = [...presentation.values()];
    presentation.clear();
    for (const apply of pending) {
      if (signal.aborted) return;
      apply();
    }
  };
  signal.addEventListener(
    "abort",
    () => {
      active = null;
      presentation.clear();
    },
    { once: true },
  );
  element.addEventListener(
    "compositionstart",
    (event) => {
      if (!ownsInputTarget(element, event.target)) return;
      if (!port.isEditable()) return;
      interruption.reset();
      const selection = port.prepareSelection();
      if (!selection.anchor.blockId) return;
      active = {
        blockId: selection.anchor.blockId,
        selection: { anchor: { ...selection.anchor }, head: { ...selection.head } },
        document: port.getDocument(),
        text: null,
        restoreDOM: captureCompositionDOM(
          element,
          selection.anchor.blockId,
          selection.head.blockId,
        ),
      };
    },
    { signal },
  );
  element.addEventListener(
    "compositionupdate",
    (event) => {
      if (active && ownsInputTarget(element, event.target)) active.text = event.data;
    },
    { signal },
  );
  element.addEventListener(
    "compositionend",
    (event) => {
      if (!ownsInputTarget(element, event.target)) return;
      if (interruption.finish(event.data)) return;
      const snapshot = active;
      active = null;
      if (!snapshot || signal.aborted) return;
      try {
        const { blockId, selection } = snapshot;
        if (!port.isEditable()) {
          snapshot.restoreDOM();
          port.restoreSelection();
          return;
        }
        if (selection.anchor.blockId !== selection.head.blockId) {
          snapshot.restoreDOM();
          if (!event.data) {
            port.restoreSelection();
            return;
          }
          try {
            const ids = entries(snapshot.document.blocks).map(({ block }) => block.id);
            const start =
              ids.indexOf(selection.anchor.blockId) < ids.indexOf(selection.head.blockId)
                ? selection.anchor
                : selection.head;
            const change = insertPayload(
              snapshot.document,
              { type: "text", ...selection },
              {
                spans: [
                  {
                    text: event.data,
                    marks: port
                      .getMarks(start.blockId, start.offset)
                      .map((mark) => ({ type: mark.type, attrs: cloneAttributes(mark.attrs) })),
                  },
                ],
              },
            );
            const transaction = documentTransaction(
              snapshot.document,
              change.document,
              change.caret,
            );
            port.commit(transaction.steps, change.caret);
          } catch (error) {
            port.reportError(
              new GoTipeError(
                "TRANSFORM_ERROR",
                error instanceof Error ? error.message : "Composition failed",
              ),
            );
          }
          return;
        }
        const blockElement = Array.from(element.querySelectorAll("[data-block-id]")).find(
          (node) => node.getAttribute("data-block-id") === blockId,
        );
        const block = port.getBlock(blockId);
        if (!blockElement || !block) return;
        const model = Array.isArray(block.content)
          ? block.content.map((span) => span.text).join("")
          : (block.content ?? "");
        let change = compositionChange(model, ownText(blockElement, blockId));
        snapshot.restoreDOM();
        // The browser composed where its caret was, maybe inside an inline atom. The model
        // caret was moved off the atom at compositionstart: the text goes there instead.
        const atoms = Array.isArray(block.content)
          ? viewAtoms(block.content.map((span) => ({ text: span.text, marks: span.marks ?? [] })))
          : [];
        if (
          (change.text || change.from !== change.to) &&
          (atomAt(atoms, change.from) || atomAt(atoms, change.to)) &&
          selection.anchor.blockId === blockId &&
          selection.head.blockId === blockId
        )
          change = {
            from: Math.min(selection.anchor.offset, selection.head.offset),
            to: Math.max(selection.anchor.offset, selection.head.offset),
            text: event.data || change.text,
          };
        if (!change.text && change.from === change.to) {
          if (
            !event.data ||
            selection.anchor.blockId !== blockId ||
            selection.head.blockId !== blockId
          ) {
            port.restoreSelection();
            return;
          }
          change = {
            from: Math.min(selection.anchor.offset, selection.head.offset),
            to: Math.max(selection.anchor.offset, selection.head.offset),
            text: event.data,
          };
        }
        const steps: unknown[] = [];
        if (change.to > change.from)
          steps.push({
            type: typeof block.content === "string" ? "deleteRange" : "deleteText",
            blockId,
            from: change.from,
            to: change.to,
          });
        if (change.text)
          steps.push({
            type: "insertText",
            blockId,
            offset: change.from,
            text: change.text,
            marks: port.getMarks(blockId, change.from),
          });
        if (!steps.length) return;
        try {
          port.commit(steps, { blockId, offset: change.from + change.text.length });
        } catch (error) {
          port.reportError(
            new GoTipeError(
              "TRANSFORM_ERROR",
              error instanceof Error ? error.message : "Composition failed",
            ),
          );
        }
      } finally {
        flushPresentation();
      }
    },
    { signal },
  );
  return {
    deferPresentation(key, apply) {
      if (!active) {
        presentation.delete(key);
        return false;
      }
      presentation.set(key, apply);
      return true;
    },
    interrupt(reason) {
      const snapshot = active;
      if (!snapshot || signal.aborted) return;
      active = null;
      let text = snapshot.text;
      if (text === null) {
        const blocks = entries(snapshot.document.blocks).map(({ block }) => block);
        const ids = blocks.map((block) => block.id);
        const { anchor, head } = snapshot.selection;
        const [start, end] =
          ids.indexOf(anchor.blockId) <= ids.indexOf(head.blockId)
            ? [anchor, head]
            : [head, anchor];
        const blockText = (id: string) => {
          const content = blocks.find((block) => block.id === id)?.content;
          return typeof content === "string"
            ? content
            : (content ?? []).map((span) => span.text).join("");
        };
        const block = Array.from(element.querySelectorAll("[data-block-id]")).find(
          (node) => node.getAttribute("data-block-id") === start.blockId,
        );
        const dom = block ? ownText(block, start.blockId) : "";
        if (start.blockId === end.blockId)
          text = compositionChange(blockText(start.blockId), dom).text;
        else {
          const prefix = blockText(start.blockId).slice(0, start.offset);
          const suffix = blockText(end.blockId).slice(end.offset);
          text =
            dom.startsWith(prefix) && dom.endsWith(suffix)
              ? dom.slice(prefix.length, dom.length - suffix.length)
              : dom;
        }
      }
      // This runs before any model/renderer write; these identities still belong
      // to the current renderer. Never restore this snapshot after that boundary.
      snapshot.restoreDOM();
      interruption.cancel(text, snapshot.selection, reason);
      flushPresentation();
    },
    get blockId() {
      return active?.blockId ?? null;
    },
  };
}
