import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'], dts: true, sourcemap: true,
  external: ['@gotipe/core', '@gotipe/theme', '@gotipe/react', '@gotipe/wasm', 'react', 'react-dom'],
  treeshake: true, clean: true,
});
