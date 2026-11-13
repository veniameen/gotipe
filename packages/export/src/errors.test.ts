import { describe, expect, it } from "vitest";
import { ExportError, toExportError } from "./errors";
import { exportBytes } from "./wasm";

describe("export errors and bytes", () => {
  it("turns the exporter's coded errors into ExportError and keeps other failures", () => {
    const rejected = Object.assign(new Error("Unsupported block type: widget"), {
      name: "GoTipeExportError",
      code: "UNSUPPORTED_BLOCK_TYPE",
    });
    const error = toExportError(rejected);
    expect(error).toBeInstanceOf(ExportError);
    expect(error).toMatchObject({
      name: "GoTipeExportError",
      code: "UNSUPPORTED_BLOCK_TYPE",
      message: "Unsupported block type: widget",
      cause: rejected,
    });
    const unknown = Object.assign(new Error("x"), { code: "SOMETHING_ELSE" });
    expect(toExportError(unknown)).toBe(unknown);
    expect(toExportError("plain")).toBe("plain");
    expect(() =>
      exportBytes(() => {
        throw rejected;
      }),
    ).toThrow(ExportError);
  });

  it("returns ArrayBuffer-backed bytes that Blob accepts without a copy by the caller", async () => {
    const source = new Uint8Array([0, 37, 80, 68, 70, 0]).subarray(1, 5);
    const bytes: Uint8Array<ArrayBuffer> = exportBytes(() => source);
    expect(bytes.buffer).toBe(source.buffer);
    expect([...bytes]).toEqual([37, 80, 68, 70]);
    const shared = new Uint8Array(new SharedArrayBuffer(2));
    expect(exportBytes(() => shared).buffer).toBeInstanceOf(ArrayBuffer);
    expect(await new Blob([bytes]).text()).toBe("%PDF");
  });
});
