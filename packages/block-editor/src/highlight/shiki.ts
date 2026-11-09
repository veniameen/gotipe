// @gotipe/block-editor/shiki — optional, lazy Shiki adapter.
// Uses shiki/core with the JavaScript regex engine: no WASM, no eval, so it
// runs under `script-src 'self'`. Nothing is loaded until the first call, and
// only the grammars you list are bundled (as lazy chunks).
import type { CodeHighlighter, HighlightToken } from "./types";

type Loader = () => Promise<unknown>;

export interface ShikiHighlighterOptions {
  /**
   * Grammars by language id, as lazy imports, e.g.
   * `{ typescript: () => import("shiki/langs/typescript.mjs") }`.
   */
  langs: Record<string, Loader>;
  /** Light and dark themes, e.g. `() => import("shiki/themes/github-light.mjs")`. */
  themes: { light: Loader; dark: Loader };
  /** Extra names for languages, e.g. `{ ts: "typescript", sh: "bash" }`. */
  aliases?: Record<string, string>;
}

interface ShikiToken {
  content: string;
  color?: string;
  fontStyle?: number;
  htmlStyle?: Record<string, string>;
  variants?: Record<string, { color?: string; fontStyle?: number }>;
}

interface ShikiCore {
  loadLanguage(...langs: unknown[]): Promise<void>;
  getLoadedLanguages(): string[];
  codeToTokensWithThemes(
    code: string,
    options: { lang: string; themes: Record<string, string> },
  ): Array<
    Array<{ content: string; variants: Record<string, { color?: string; fontStyle?: number }> }>
  >;
}

function moduleDefault<T>(mod: unknown): T {
  const m = mod as { default?: T };
  return (m && m.default !== undefined ? m.default : mod) as T;
}

export function createShikiHighlighter(options: ShikiHighlighterOptions): CodeHighlighter {
  let core: Promise<{ highlighter: ShikiCore; light: string; dark: string }> | null = null;
  const loading = new Map<string, Promise<boolean>>();

  const init = () => {
    if (!core) {
      core = (async () => {
        const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark] =
          await Promise.all([
            import("shiki/core"),
            import("shiki/engine/javascript"),
            options.themes.light(),
            options.themes.dark(),
          ]);
        const lightTheme = moduleDefault<{ name: string }>(light);
        const darkTheme = moduleDefault<{ name: string }>(dark);
        const highlighter = (await createHighlighterCore({
          themes: [lightTheme as never, darkTheme as never],
          langs: [],
          engine: createJavaScriptRegexEngine(),
        })) as unknown as ShikiCore;
        return { highlighter, light: lightTheme.name, dark: darkTheme.name };
      })();
      core.catch(() => {
        core = null;
      });
    }
    return core;
  };

  const ensureLanguage = (highlighter: ShikiCore, id: string): Promise<boolean> => {
    const loader = options.langs[id];
    if (!loader) return Promise.resolve(false);
    let pending = loading.get(id);
    if (!pending) {
      pending = loader()
        .then((mod) => highlighter.loadLanguage(moduleDefault(mod)))
        .then(() => true)
        .catch(() => false);
      loading.set(id, pending);
    }
    return pending;
  };

  return async (code, language) => {
    const id = options.aliases?.[language] ?? language;
    if (!options.langs[id]) return null;
    const { highlighter, light, dark } = await init();
    if (!(await ensureLanguage(highlighter, id))) return null;
    const lines = highlighter.codeToTokensWithThemes(code, { lang: id, themes: { light, dark } });
    return lines.map((line) =>
      line.map(
        (token): HighlightToken => ({
          content: token.content,
          color: token.variants.light?.color,
          darkColor: token.variants.dark?.color,
          fontStyle: token.variants.light?.fontStyle,
        }),
      ),
    );
  };
}

export type { CodeHighlighter, HighlightToken } from "./types";
export type { ShikiToken };
