import { afterEach, describe, expect, it, vi } from "vitest";
import { DefaultPreset } from "../src/presets";
import { ENGINES, createOn, doc, paragraph } from "./engines";

// D-13: without `host.openLink` the editor opens a link as `newTab` asks — a new tab by
// default, this tab for `newTab: false` — instead of always a new tab.
afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = "";
});

describe.each(ENGINES)("%s engine: openLink without a host (D-13)", (engine) => {
  it("opens a new tab by default and goes to the link in this tab for newTab: false", async () => {
    const editor = await createOn(engine, {
      extensions: DefaultPreset,
      content: doc(paragraph("a", "x")),
    });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    editor.openLink("https://example.com/a", { blockId: "a" });
    expect(open).toHaveBeenCalledWith("https://example.com/a", "_blank", "noopener,noreferrer");
    editor.openLink("#part", { newTab: false });
    expect(open).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#part");
    const errors: string[] = [];
    editor.on("error", (error) => errors.push(error.code));
    editor.openLink("javascript:alert(1)", { newTab: false });
    expect(window.location.hash).toBe("#part");
    expect(errors).toEqual(["LINK_BLOCKED"]);
    editor.destroy();
  });
});
