import { describe, expect, it } from "vitest";
import { breakable } from "./render";

describe("breakable code in table cells", () => {
  it("breaks after punctuation and between the words of a camelCase name", () => {
    expect(breakable("showCollaborationCursors")).toBe("show<wbr>Collaboration<wbr>Cursors");
    expect(breakable("editor.focus(position)")).toBe("editor.<wbr>focus(<wbr>position)");
  });

  it("keeps an empty pair of brackets together", () => {
    // (Extension | Extension[])[] — the quick start's type of `extensions`
    expect(breakable("(Extension | Extension[])[]")).toBe("(<wbr>Extension | Extension[])[]");
    expect(breakable("onCreate()")).toBe("on<wbr>Create()");
    expect(breakable("{}")).toBe("{}");
  });
});
