import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    js: 'src/js.ts',
    'extensions/index': 'src/extensions/index.ts',
    presets: 'src/presets.ts',
    ssr: 'src/ssr.ts',
    vanilla: 'src/vanilla.ts',
    emoji: 'src/emoji.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  external: ['@gotipe/wasm'],
  treeshake: true,
  clean: true,
});
