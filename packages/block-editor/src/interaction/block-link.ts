import { type GoTipeEditor, GoTipeError } from "@gotipe/core";

/** The query parameter of a link to a block; `EditorContent` scrolls to that block on opening. */
export const BLOCK_LINK_PARAM = "gotipe-block";

/**
 * A link to a block: the address of the host's page — its route, its hash — with the block's id in
 * `gotipe-block`. The host builds the address; the editor only names the block.
 */
export function blockLink(blockId: string, page: string = window.location.href): string {
  const url = new URL(page);
  url.searchParams.set(BLOCK_LINK_PARAM, blockId);
  return url.href;
}

/**
 * Copies the link to a block («Copy link to block», a heading's anchor). A clipboard the browser
 * refuses is the editor's `CLIPBOARD_FAILED` error with the browser's reason, or `unavailable`
 * when it gives none. Says whether the link was copied.
 */
export async function copyBlockLink(
  editor: GoTipeEditor,
  blockId: string,
  unavailable: string,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(blockLink(blockId));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : unavailable;
    // a refusal that comes back after the editor is gone has no one to tell
    if (!editor.isDestroyed) editor.reportError(new GoTipeError("CLIPBOARD_FAILED", message));
    return false;
  }
}
