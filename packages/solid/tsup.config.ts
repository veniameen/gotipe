import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  external: ['@gotipe/core', '@gotipe/wasm', 'solid-js'],
  treeshake: true,
  clean: true,
});
