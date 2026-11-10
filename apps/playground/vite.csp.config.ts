import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";

// A test consumer of the public library, separate from the playground product UI.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'";

function consumerCsp(): Plugin {
  return {
    name: "gotipe-consumer-csp-test",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), consumerCsp()],
  resolve: {
    alias: [{ find: /^@gotipe\/core$/, replacement: "@gotipe/core/js" }],
  },
  build: {
    outDir: "output/csp-consumer",
    emptyOutDir: true,
    rollupOptions: { input: "tests/csp/index.html" },
  },
  preview: { port: 5310, strictPort: true },
});
