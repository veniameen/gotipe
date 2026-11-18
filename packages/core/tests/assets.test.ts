// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { INLINE_ASSET_LIMIT, encodeInlineAsset, saveAsset } from "../src/assets";
import { GoTipeError } from "../src/error";

describe("durable assets", () => {
  it("serializes standalone bytes into a reloadable data URL", async () => {
    const result = await saveAsset(
      {},
      new Blob([new Uint8Array([0, 1, 255])], { type: "image/png" }),
      "image",
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual({
      src: "data:image/png;base64,AAH/",
      name: "image",
    });
  });
  it("rejects oversized inline assets and executable image formats", async () => {
    await expect(
      encodeInlineAsset(new Blob([new Uint8Array(INLINE_ASSET_LIMIT + 1)])),
    ).rejects.toMatchObject({ code: "ASSET_TOO_LARGE" });
    await expect(
      saveAsset({}, new Blob(["<svg/>"], { type: "image/svg+xml" }), "image"),
    ).rejects.toMatchObject({ code: "ASSET_UNSUPPORTED" });
  });
  it("uses durable host paths, preserves metadata, and surfaces host failures", async () => {
    const save = vi.fn().mockResolvedValue({ src: "assets/report.pdf", name: "Report" });
    const blob = new Blob(["pdf"], { type: "application/pdf" });
    expect(await saveAsset({ saveAsset: save }, blob, "file")).toEqual({
      src: "assets/report.pdf",
      name: "Report",
    });
    expect(save).toHaveBeenCalledWith(blob, {
      kind: "file",
      name: "file",
      mediaType: "application/pdf",
      size: 3,
    });
    await expect(
      saveAsset({ saveAsset: async () => ({ src: "" }) }, blob, "file"),
    ).rejects.toMatchObject({ code: "ASSET_SAVE_FAILED" });
    // a plain throw from the host is a failed save with the asset's details; a GoTipeError stays
    const thrown = new Error("quota exceeded");
    await expect(
      saveAsset({ saveAsset: async () => Promise.reject(thrown) }, blob, "file"),
    ).rejects.toMatchObject({
      code: "ASSET_SAVE_FAILED",
      message: "quota exceeded",
      details: { kind: "file", name: "file", mediaType: "application/pdf", size: 3, cause: thrown },
    });
    await expect(
      saveAsset(
        {
          saveAsset: async () => {
            throw new GoTipeError("ASSET_UNSUPPORTED", "no PDFs here");
          },
        },
        blob,
        "file",
      ),
    ).rejects.toMatchObject({ code: "ASSET_UNSUPPORTED" });
    await expect(
      saveAsset(
        {
          saveAsset: async () => {
            throw new Error("offline");
          },
        },
        blob,
        "file",
      ),
    ).rejects.toThrow("offline");
  });
});
