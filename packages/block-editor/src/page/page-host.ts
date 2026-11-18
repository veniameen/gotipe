import type { EditorHost } from "@gotipe/core";
import { saveAsset } from "@gotipe/core/js";
import type { MutableRefObject } from "react";

/**
 * The editor's host for a page: one object for the editor's life that reads the latest
 * callbacks the page got, so a host that passes new functions on every render keeps its editor.
 */
export function createPageHost(
  host: MutableRefObject<EditorHost | undefined>,
  onError: MutableRefObject<EditorHost["onError"]>,
): EditorHost {
  return {
    get imageSources() {
      return host.current?.imageSources;
    },
    saveAsset: (file, info) => {
      const save = host.current?.saveAsset;
      if (!save) return saveAsset({}, file, info.kind);
      return save(file, info);
    },
    // the host's null means “unavailable”: the image shows its failed state, nothing is fetched
    resolveAsset: (src) => {
      const resolve = host.current?.resolveAsset;
      return resolve ? resolve(src) : src;
    },
    openLink: (href, info) => {
      if (host.current?.openLink) host.current.openLink(href, info);
      else if (info.newTab) window.open(href, "_blank", "noopener,noreferrer");
      else window.location.assign(href);
    },
    onError: (error) => {
      host.current?.onError?.(error);
      onError.current?.(error);
    },
  };
}
