/**
 * The site's light, dark or system theme. The choice lives in localStorage; the resolved theme is
 * `data-theme` on <html>, which both the site tokens and the library's palette read. The inline
 * script of the layout sets it before the first paint, so a page never flashes the other theme.
 */

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "gotipe-site-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs in <head> before the body is parsed. Kept in ES5 and self-contained: it cannot import.
 * Without storage (a blocked or private profile) it follows the system.
 */
export const THEME_SCRIPT = `(function(){var r=document.documentElement,m=null;try{m=window.localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){m=null}var d=m==="dark"||(m!=="light"&&window.matchMedia&&window.matchMedia("${DARK_QUERY}").matches);r.setAttribute("data-theme",d?"dark":"light")})();`;

function isMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function readMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isMode(stored) ? stored : "system";
  } catch {
    // storage blocked: the page follows the system, as the inline script did
    return "system";
  }
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function resolve(mode: ThemeMode): ResolvedTheme {
  return mode === "system" ? systemTheme() : mode;
}

/** Stores the choice and applies it. Returns whether storage kept it (the theme applies anyway). */
export function chooseMode(mode: ThemeMode): boolean {
  document.documentElement.setAttribute("data-theme", resolve(mode));
  try {
    if (mode === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

/** Follows the system while the mode is `system`. Returns the cleanup. */
export function followSystem(onChange: (theme: ResolvedTheme) => void): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};
  const change = () => {
    const theme: ResolvedTheme = query.matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    onChange(theme);
  };
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
