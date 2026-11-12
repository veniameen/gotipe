import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts', shiki: 'src/highlight/shiki.ts' },
  format: ['esm', 'cjs'], dts: true, sourcemap: true,
  external: [/^shiki(\/|$)/, '@gotipe/core', '@gotipe/core/js', '@gotipe/core/extensions', '@gotipe/i18n', '@gotipe/markdown', '@gotipe/suggestions', '@gotipe/theme', '@gotipe/react', '@gotipe/wasm', 'react', 'react-dom'],
  treeshake: true, clean: true,
});
