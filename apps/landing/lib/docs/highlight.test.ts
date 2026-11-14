import { describe, expect, it } from "vitest";
import { SAMPLE_TEXT } from "../../components/landing/code-sample";
import { highlightLines } from "./highlight";

describe("highlighting", () => {
  it("draws the landing's sample as frame 20 does", async () => {
    const lines = await highlightLines(SAMPLE_TEXT.trimEnd(), "tsx");
    const html = lines.join("\n");
    expect(html).toContain("<span class=k>export function </span><span class=t>Notes</span>");
    expect(html).toContain('<span class=s>"@gotipe/react"</span>');
    expect(html).toMatch(/<span class=p>[^<]*=&gt;/);
    expect(html).not.toMatch(/<span class=k>[^<]*=&gt;/);
    expect(html).toContain("<span class=t>BlockEditor</span>");
  });

  it("keeps an unknown language as escaped text", async () => {
    expect(await highlightLines("a < b\nc", "nope")).toEqual(["a &lt; b", "c"]);
  });
});
