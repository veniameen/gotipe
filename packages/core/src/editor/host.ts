import { GoTipeError } from "../error";
import { toSafeHref } from "../security/urls";
import type { EditorHost } from "../types/editor";

/** Adapts optional host callbacks to safe link/error behavior. */
export function createHostActions(
  host: EditorHost,
  port: {
    emitError(error: GoTipeError): void;
    hasErrorListeners(): boolean;
    compositionInterrupted(): void;
  },
) {
  const reportError = (error: GoTipeError): void => {
    if (error.code === "COMPOSITION_CONFLICT") port.compositionInterrupted();
    try {
      port.emitError(error);
    } catch {
      // Listener errors must not mask the original error.
    }
    try {
      host.onError?.(error);
    } catch {
      // Host callback errors are ignored on purpose.
    }
    if (!host.onError && !port.hasErrorListeners()) {
      console.error(error);
    }
  };
  const openLink = (
    href: string,
    linkOptions?: { blockId?: string | null; newTab?: boolean; target?: string | null },
  ): void => {
    const safe = toSafeHref(href);
    if (!safe) {
      reportError(new GoTipeError("LINK_BLOCKED", `Blocked link: ${href}`, { href }));
      return;
    }
    const info = {
      blockId: linkOptions?.blockId ?? null,
      newTab: linkOptions?.newTab ?? true,
      target: linkOptions?.target ?? null,
    };
    if (host.openLink) {
      try {
        host.openLink(safe, info);
      } catch (e) {
        reportError(
          new GoTipeError("LINK_OPEN_FAILED", e instanceof Error ? e.message : String(e), {
            href: safe,
          }),
        );
      }
      return;
    }
    // Without a host `newTab` decides too: `false` goes to the link in this tab (D-13);
    // `target` is the host's to read (D-186).
    if (typeof window !== "undefined") {
      if (info.newTab) window.open(safe, "_blank", "noopener,noreferrer");
      else window.location.assign(safe);
    }
  };
  return { reportError, openLink };
}
