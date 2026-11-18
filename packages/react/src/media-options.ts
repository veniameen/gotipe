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
}

/** `MediaOptions` with each default filled in. */
export type ResolvedMediaOptions = Required<MediaOptions>;

const DEFAULTS: ResolvedMediaOptions = { links: true, inlineErrors: true };

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
  };
}
