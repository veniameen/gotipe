const WHEN_SELECTORS: Record<string, string> = {
  inTable: "table",
  inCodeBlock: "pre, .gotipe-code-block",
  inList: "ul, ol",
  inBlockquote: "blockquote",
};

export function evaluateWhen(condition: string, target: HTMLElement): boolean {
  const selector = WHEN_SELECTORS[condition];
  if (!selector) return true;
  return target.closest(selector) !== null;
}

export function matchKeybinding(event: KeyboardEvent, key: string): boolean {
  const parts = key.toLowerCase().split("-");
  const mainKey = parts[parts.length - 1];
  const needsMod = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");

  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const modPressed = isMac ? event.metaKey : event.ctrlKey;

  if (needsMod && !modPressed) return false;
  if (!needsMod && modPressed) return false;
  if (needsShift && !event.shiftKey) return false;
  if (!needsShift && event.shiftKey) return false;
  if (needsAlt && !event.altKey) return false;
  if (!needsAlt && event.altKey) return false;

  if (event.key.toLowerCase() === mainKey) return true;
  // Non-Latin layouts (e.g. Russian): Cmd+B reports key "и" — match the
  // physical key instead, so shortcuts work on any layout.
  if (mainKey && /^[a-z]$/.test(mainKey) && event.code === `Key${mainKey.toUpperCase()}`) {
    return !/^[a-z]$/i.test(event.key);
  }
  if (mainKey && /^[0-9]$/.test(mainKey) && event.code === `Digit${mainKey}`) {
    return !/^[0-9]$/.test(event.key);
  }
  return false;
}
