import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts', shiki: 'src/highlight/shiki.ts' },
  format: ['esm', 'cjs'], dts: true, sourcemap: true,
  external: ['shiki', 'shiki/core', 'shiki/engine/javascript', '@gotipe/core', '@gotipe/theme', '@gotipe/react', '@gotipe/wasm', 'react', 'react-dom'],
  treeshake: true, clean: true,
});
