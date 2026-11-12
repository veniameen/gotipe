import { type GoTipeEditor, GoTipeError, toSafeHref } from "@gotipe/core";

/** Data attachments are downloaded, never navigated as an executable document. */
export function downloadAsset(
  editor: GoTipeEditor,
  url: string,
  name: string,
  blocked = "The attachment URL is not supported",
): void {
  const inline = /^data:[\w.+-]+\/[\w.+-]+;base64,[a-z0-9+/=\s]*$/i.test(url);
  const safe = inline ? url : toSafeHref(url);
  if (!safe) {
    editor.reportError(new GoTipeError("LINK_BLOCKED", blocked));
    return;
  }
  const link = document.createElement("a");
  link.href = safe;
  link.download = name || "download";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
}
