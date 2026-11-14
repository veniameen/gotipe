import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEMO_NAMES, DemoIsland, isDemoName } from ".";
import { DEMO_LOADERS } from "./loaders";
import { DEMO_META } from "./names";
import { ensureRandomUUID } from "./secure-ids";

describe("live demos", () => {
  it("names, loaders and window sizes cover the same demos", () => {
    expect(Object.keys(DEMO_LOADERS).sort()).toEqual([...DEMO_NAMES].sort());
    expect(Object.keys(DEMO_META).sort()).toEqual([...DEMO_NAMES].sort());
    expect(new Set(DEMO_NAMES).size).toBe(DEMO_NAMES.length);
  });

  it("keeps every bar hint short enough for a phone", () => {
    for (const name of DEMO_NAMES) expect(DEMO_META[name].hint.length).toBeLessThanOrEqual(20);
  });

  it("gives ids without a secure context's crypto.randomUUID", () => {
    const crypto = globalThis.crypto;
    const native = crypto.randomUUID;
    Reflect.deleteProperty(crypto, "randomUUID");
    Object.defineProperty(crypto, "randomUUID", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      ensureRandomUUID();
      expect(crypto.randomUUID()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(crypto, "randomUUID", {
        value: native,
        configurable: true,
        writable: true,
      });
    }
  });

  it.each(DEMO_NAMES)("%s loads a component from its own chunk", async (name) => {
    const Demo = await DEMO_LOADERS[name]();
    expect(typeof Demo).toBe("function");
  });

  it("renders the window and its placeholder on the server, without the editor", () => {
    const html = renderToString(<DemoIsland name="tables" />);
    expect(html).toContain('data-demo="tables"');
    expect(html).toContain("Live editor");
    expect(html).toContain("Loading the editor");
    expect(html).not.toContain("gotipe-editor");
  });

  it("falls back quietly for an unknown name", () => {
    expect(isDemoName("no-such-demo")).toBe(false);
    const html = renderToString(<DemoIsland name="no-such-demo" />);
    expect(html).toContain("No live demo is available here.");
    expect(html).not.toContain("site-demo-body");
  });
});
