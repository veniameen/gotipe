import { defineConfig } from "vitest/config";

/**
 * The landing's tests: the docs pipeline's pure logic (lib/) and the demos (components/demos).
 * Node, React's automatic JSX (the app's tsconfig keeps JSX for Next), the app's `@/` alias.
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    root: import.meta.dirname,
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts", "components/**/*.test.tsx"],
    testTimeout: 30_000,
  },
});
