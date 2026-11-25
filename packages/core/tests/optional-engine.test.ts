import { beforeEach, describe, expect, it, vi } from "vitest";
import { doc, paragraph } from "./engines";

// @gotipe/wasm is an optional peer: an app without it runs on the JS engine. Each test loads
// the core afresh, so the loader keeps no module from an earlier test.
const notInstalled = () => {
  throw new Error("Cannot find module '@gotipe/wasm'");
};

async function loadCore() {
  const [{ createEditor, GoTipeError }, { DefaultPreset }] = await Promise.all([
    import("../src/index"),
    import("../src/presets"),
  ]);
  return { createEditor, GoTipeError, DefaultPreset };
}

beforeEach(() => {
  vi.doUnmock("@gotipe/wasm");
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("without @gotipe/wasm installed", () => {
  it('engine "auto" edits on the JS engine and warns once, naming the package', async () => {
    vi.doMock("@gotipe/wasm", notInstalled);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { createEditor, DefaultPreset } = await loadCore();
    const editor = await createEditor({
      extensions: [DefaultPreset],
      content: doc(paragraph("p", "Ж😀")),
    });
    try {
      expect(editor.engine).toBe("js");
      expect(
        editor.dispatch({
          steps: [{ type: "insertText", blockId: "p", offset: 0, text: "JS ", marks: [] }],
        }),
      ).toBe(true);
      expect(editor.getText()).toBe("JS Ж😀");
      expect(warn).toHaveBeenCalledTimes(1);
      const [label, error] = warn.mock.calls[0] ?? [];
      expect(label).toBe("GoTipe WASM init failed, using JS engine:");
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(
        /^@gotipe\/wasm could not be loaded \(.+\)\. Install @gotipe\/wasm for the Rust engine, or pass engine: "js"\.$/s,
      );
    } finally {
      editor.destroy();
    }
  });

  it('engine "wasm" rejects with WASM_INIT_FAILED that says what to install', async () => {
    vi.doMock("@gotipe/wasm", notInstalled);
    const { createEditor, GoTipeError, DefaultPreset } = await loadCore();
    const error = await createEditor({ extensions: [DefaultPreset], engine: "wasm" }).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(GoTipeError);
    expect(error).toMatchObject({ code: "WASM_INIT_FAILED" });
    expect((error as Error).message).toMatch(
      /^@gotipe\/wasm could not be loaded .*Install @gotipe\/wasm/s,
    );
  });
});

describe("with @gotipe/wasm installed", () => {
  it("a binary that fails to start keeps its own message, with no advice to install", async () => {
    vi.doMock("@gotipe/wasm", () => ({
      default: () => Promise.reject(new Error("WebAssembly.instantiate(): expected magic word")),
      WasmEditor: class {},
    }));
    const { createEditor, DefaultPreset } = await loadCore();
    await expect(
      createEditor({ extensions: [DefaultPreset], engine: "wasm" }),
    ).rejects.toMatchObject({
      code: "WASM_INIT_FAILED",
      message: "WebAssembly.instantiate(): expected magic word",
    });
  });
});
