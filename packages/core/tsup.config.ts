import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'extensions/index': 'src/extensions/index.ts',
    presets: 'src/presets.ts',
    ssr: 'src/ssr.ts',
    vanilla: 'src/vanilla.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  external: ['@gotipe/wasm'],
  treeshake: true,
  clean: true,
});
