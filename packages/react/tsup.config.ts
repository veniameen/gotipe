import { defineConfig } from 'tsup';

export default defineConfig({
  // `media` is the image and file editing UI; the React entry shows media read-only without it.
  entry: { index: 'src/index.ts', media: 'src/media/index.ts' },
  format: ['esm', 'cjs'],
  // Both formats share chunks, so the entries use one i18n, phantom and media context.
  splitting: true,
  dts: true,
  sourcemap: true,
  external: ['@gotipe/i18n', '@gotipe/core', '@gotipe/wasm', 'react', 'react-dom'],
  treeshake: true,
  clean: true,
});
