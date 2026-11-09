import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';

/**
 * The wiki page built the way SpecOrbit will build it: the JS engine only
 * (`@gotipe/core` → `@gotipe/core/js`, so no WASM is bundled) and SpecOrbit's
 * Content-Security-Policy in the page. `pnpm build:wiki && pnpm preview:wiki`.
 */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'";

function specOrbitCsp(): Plugin {
  return {
    name: 'gotipe-specorbit-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), specOrbitCsp()],
  resolve: {
    alias: [{ find: /^@gotipe\/core$/, replacement: '@gotipe/core/js' }],
  },
  build: {
    minify: process.env.GOTIPE_WIKI_MINIFY === '0' ? false : 'esbuild',
    outDir: 'dist-wiki',
    emptyOutDir: true,
    rollupOptions: { input: 'wiki.html' },
  },
  preview: { port: 5310, strictPort: true },
});
