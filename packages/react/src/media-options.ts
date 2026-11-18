import { createContext, useContext } from "react";

/** What the empty image and file blocks of `@gotipe/react/media` offer, and how they fail. */
export interface MediaOptions {
  /**
   * The “By link” button of an empty image or file block and the link tab of the image panel.
   * Default: `true`. `false` leaves upload and drop, plus the host's `imageSources` catalogs
   * behind the same button, e.g. when the host's CSP blocks images from the web.
   */
  links?: boolean;
  /**
   * The reason of a failed upload, link or action shown in the block itself. Default: `true`.
   * `false` shows no such text; every failure still reaches `host.onError` (the `error` event),
   * so a host that shows errors its own way, e.g. as toasts, gets them all.
   */
  inlineErrors?: boolean;
  /**
   * An image without a caption shows its file name (`alt`, else the last part of `src`) as a
   * quiet hint in the caption's place (`.gotipe-image-caption-hint`). Default: `false`. The hint
   * is not a caption: it is not written to the document.
   */
  captionName?: boolean;
  /**
   * The empty image or file block: `"block"` (default) — a sunken area with what it holds and a
   * primary Upload; `"row"` — one quiet row with a glyph, the block's kind and a secondary
   * “Choose a file…” (`data-layout="row"` on `.gotipe-media-placeholder`).
   */
  placeholder?: "block" | "row";
}

/** `MediaOptions` with each default filled in. */
export type ResolvedMediaOptions = Required<MediaOptions>;

const DEFAULTS: ResolvedMediaOptions = {
  links: true,
  inlineErrors: true,
  captionName: false,
  placeholder: "block",
};

/**
 * The options of the editing image and file blocks for the editor below it:
 * `<MediaOptionsContext.Provider value={{ links: false }}>`. `BlockEditor` and `PageEditor`
 * provide it from their `media` prop. Without a provider every option has its default.
 */
export const MediaOptionsContext = createContext<MediaOptions | null>(null);

/** The media options in force, defaults filled in. */
export function useMediaOptions(): ResolvedMediaOptions {
  const options = useContext(MediaOptionsContext);
  return {
    links: options?.links ?? DEFAULTS.links,
    inlineErrors: options?.inlineErrors ?? DEFAULTS.inlineErrors,
    captionName: options?.captionName ?? DEFAULTS.captionName,
    placeholder: options?.placeholder ?? DEFAULTS.placeholder,
  };
}

/** The name an image without a caption shows with `captionName`: its `alt`, else its file's. */
export function imageName(alt: string, src: string): string {
  if (alt.trim()) return alt.trim();
  if (/^(?:data|blob):/i.test(src)) return "";
  const path = src.split(/[?#]/)[0] ?? "";
  const last = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
