import type { I18n } from "@gotipe/i18n";

/** Size in the reader's locale: «470.8 KB» in English, «470,8 КБ» in Russian. */
export function formatFileSize(
  bytes: number | undefined,
  i18n: Pick<I18n, "t" | "locale">,
): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  const number = (value: number, digits: number) => {
    const options = { minimumFractionDigits: digits, maximumFractionDigits: digits };
    try {
      return new Intl.NumberFormat(i18n.locale, { ...options, useGrouping: false }).format(value);
    } catch {
      // A host locale name that is not a BCP 47 tag still gets a size.
      return value.toFixed(digits);
    }
  };
  if (bytes < 1024) return i18n.t("media.sizeB", { size: number(bytes, 0) });
  if (bytes < 1024 * 1024) return i18n.t("media.sizeKB", { size: number(bytes / 1024, 1) });
  return i18n.t("media.sizeMB", { size: number(bytes / (1024 * 1024), 1) });
}

export function normalizeHttpUrl(raw: string): string | null {
  const value = raw.trim();
  // Some engines percent-encode spaces in a host instead of rejecting it: «not a url» is no address.
  if (!value || /\s/.test(value)) return null;

  const typedScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
  const withProtocol = typedScheme ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Without a scheme, a word is not a site: «example.com/a.png» is, «picture» is not.
    if (!typedScheme && !url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function inferFileNameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split("/").filter(Boolean).pop();
    if (!path) return fallback;
    return decodeURIComponent(path);
  } catch {
    return fallback;
  }
}
