import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A test consumer of the public library for typing latency (`scripts/perf/typing-latency.mjs`),
// separate from the playground product UI. GOTIPE_PERF_READABLE=1 keeps names for a CPU profile.
export default defineConfig({
  plugins: [react()],
  // the JS engine only, as PageEditor runs: the build needs no WASM package
  resolve: {
    alias: [{ find: /^@gotipe\/core$/, replacement: "@gotipe/core/js" }],
  },
  build: {
    outDir: "output/perf-consumer",
    emptyOutDir: true,
    minify: process.env.GOTIPE_PERF_READABLE ? false : "esbuild",
    rollupOptions: { input: "tests/perf/index.html" },
  },
  preview: { port: 5320, strictPort: true },
});
