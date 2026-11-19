import type { EditorHost } from "@gotipe/core";
import { describe, expect, it, vi } from "vitest";
import { createPageHost } from "./page-host";

/**
 * Every member of `EditorHost`: a member the core gains fails the type check here until the
 * page's host passes it on (and this list names it).
 */
const MEMBERS = {
  imageSources: true,
  saveAsset: true,
  resolveAsset: true,
  discardAsset: true,
  openLink: true,
  onError: true,
} satisfies Record<keyof EditorHost, true>;

describe("PageEditor's host passes every EditorHost member on", () => {
  it("covers each member of EditorHost", () => {
    expect(Object.keys(MEMBERS).sort()).toEqual(
      ["discardAsset", "imageSources", "onError", "openLink", "resolveAsset", "saveAsset"].sort(),
    );
  });

  it("reaches the host's latest callbacks", async () => {
    const asset = { src: "assets/a.png", name: "a.png", kind: "image" as const };
    const sources = [{ id: "stock", label: "Stock", search: async () => [] }];
    const host: Required<EditorHost> = {
      imageSources: sources,
      saveAsset: vi.fn(async () => ({ src: "assets/a.png" })),
      resolveAsset: vi.fn(() => "data:image/png;base64,AA=="),
      discardAsset: vi.fn(),
      openLink: vi.fn(),
      onError: vi.fn(),
    };
    const pageError = vi.fn();
    const page = createPageHost({ current: host }, { current: pageError });
    const blob = new Blob(["x"], { type: "image/png" });
    const info = { kind: "image" as const, name: "a.png", mediaType: "image/png", size: 1 };
    expect(page.imageSources).toBe(sources);
    await page.saveAsset?.(blob, info);
    expect(host.saveAsset).toHaveBeenCalledWith(blob, info);
    expect(await page.resolveAsset?.("assets/a.png")).toBe("data:image/png;base64,AA==");
    page.discardAsset?.(asset);
    expect(host.discardAsset).toHaveBeenCalledWith(asset);
    const link = { blockId: null, newTab: true, target: null };
    page.openLink?.("https://example.test", link);
    expect(host.openLink).toHaveBeenCalledWith("https://example.test", link);
    const error = new Error("x") as Parameters<NonNullable<EditorHost["onError"]>>[0];
    page.onError?.(error);
    expect(host.onError).toHaveBeenCalledWith(error);
    expect(pageError).toHaveBeenCalledWith(error);
  });

  it("offers discardAsset only to a host that stores files and drops them", () => {
    const ref: { current: EditorHost | undefined } = { current: undefined };
    const page = createPageHost(ref, { current: undefined });
    expect(page.discardAsset).toBeUndefined();
    ref.current = { discardAsset: vi.fn() };
    expect(page.discardAsset).toBeUndefined();
    ref.current = { saveAsset: async () => ({ src: "a" }), discardAsset: vi.fn() };
    expect(typeof page.discardAsset).toBe("function");
  });
});

describe("PageEditor's host calls a host object's methods as methods", () => {
  it("keeps `this` for saveAsset and resolveAsset", async () => {
    class Store {
      prefix = "assets/";
      async saveAsset(_file: Blob, info: { name: string }) {
        return { src: this.prefix + info.name };
      }
      resolveAsset(src: string) {
        return `${this.prefix}resolved/${src}`;
      }
    }
    const store = new Store() as unknown as EditorHost;
    const page = createPageHost({ current: store }, { current: undefined });
    const info = { kind: "image" as const, name: "a.png", mediaType: "image/png", size: 1 };
    expect(await page.saveAsset?.(new Blob(["x"]), info)).toEqual({ src: "assets/a.png" });
    expect(page.resolveAsset?.("x.png")).toBe("assets/resolved/x.png");
  });
});
