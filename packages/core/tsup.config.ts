import path from "node:path";
import { type Options, defineConfig } from "tsup";

type Plugin = NonNullable<Options["plugins"]>[number];

// With shared chunks a CJS entry would load the package's own lazy chunk (the editor that
// `@gotipe/core/server` imports on first use) through import(), which Jest and other
// require() loaders without ES module support cannot run. In CJS the chunk is required
// on first use instead; import() of external packages (@gotipe/wasm) stays as it is.
const requireOwnLazyChunks: Plugin = {
  name: "require-own-lazy-chunks",
  renderChunk(code, chunk) {
    if (this.format !== "cjs") return;
    const lazyChunks = new Set(
      (chunk.imports ?? [])
        .filter((target) => target.kind === "dynamic-import" && !target.external)
        .map((target) => {
          const relative = path.relative(path.dirname(chunk.path), path.resolve(target.path));
          const posix = relative.split(path.sep).join("/");
          return posix.startsWith(".") ? posix : `./${posix}`;
        }),
    );
    let result = code;
    for (const lazyChunk of lazyChunks) {
      const specifier = JSON.stringify(lazyChunk);
      const call = `import(${specifier})`;
      if (!result.includes(call)) throw new Error(`${chunk.path}: ${call} not found`);
      result = result.split(call).join(`Promise.resolve().then(() => require(${specifier}))`);
    }
    return result === code ? undefined : { code: result };
  },
};

export default defineConfig({
  entry: {
    index: "src/index.ts",
    js: "src/js.ts",
    "extensions/index": "src/extensions/index.ts",
    presets: "src/presets.ts",
    ssr: "src/ssr.ts",
    vanilla: "src/vanilla.ts",
    emoji: "src/emoji.ts",
    "emoji/ru": "src/emoji-ru.ts",
    math: "src/math.ts",
  },
  format: ["esm", "cjs"],
  // CJS entries share chunks as ESM ones do: one GoTipeError class and one copy of every
  // module per package, so `instanceof` holds across entries (D-166).
  splitting: true,
  plugins: [requireOwnLazyChunks],
  dts: true,
  sourcemap: true,
  external: ["@gotipe/wasm"],
  treeshake: true,
  clean: true,
});
