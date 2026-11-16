import { getMarksAt } from "../document/tree";
import type { ViewState } from "../types/view";

export interface LinkActivationPort {
  readonly editable: boolean;
  getViewState(): ViewState;
  openLink(
    href: string,
    options: { blockId: string | null; newTab: boolean; target: string | null },
  ): void;
}

/**
 * Links never navigate the page: a plain click places the caret while editing; Cmd/Ctrl+click,
 * a middle click or any click when read-only goes through `openLink`. The host gets the link's
 * own `target` and decides where it opens (D-186); without a host it is a new tab, as before.
 */
export function installLinkActivation(
  element: HTMLElement,
  signal: AbortSignal,
  port: LinkActivationPort,
  resolve: (node: Node, offset: number) => { blockId: string; offset: number } | null,
): void {
  const onLinkActivate = (e: MouseEvent) => {
    const anchor = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!anchor || !element.contains(anchor)) return;
    e.preventDefault();
    if (port.editable && !e.metaKey && !e.ctrlKey && e.button !== 1) return;
    const blockId = anchor.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
    // The link mark of the anchor's first character: adapters do not draw `target`.
    const at = resolve(anchor, 0);
    const marks = at ? getMarksAt(port.getViewState().blocks, at.blockId, at.offset, false) : [];
    const target = marks.find((mark) => mark.type === "link")?.attrs.target;
    port.openLink(anchor.getAttribute("href") ?? "", {
      blockId,
      newTab: true,
      target: typeof target === "string" ? target : null,
    });
  };
  element.addEventListener("click", onLinkActivate, { signal });
  element.addEventListener("auxclick", onLinkActivate, { signal });
}
