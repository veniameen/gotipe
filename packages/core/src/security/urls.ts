const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Only web/mail links and relative references may reach the host or renderer. */
export function toSafeHref(href: string): string | null {
  const value = href.trim();
  if (!value) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: browsers ignore these in URL schemes
  const compact = value.replace(/[\u0000-\u001F\u007F\s]+/g, "");
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(compact);
  if (!scheme) return value;
  return SAFE_LINK_PROTOCOLS.has(`${scheme[1]!.toLowerCase()}:`) ? value : null;
}

/** Raster data URLs are allowed for images; executable data and non-web schemes are not. */
export function toSafeImageSrc(src: string): string | null {
  const value = src.trim();
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  const href = toSafeHref(value);
  return href && !/^mailto:/i.test(href) ? href : null;
}
