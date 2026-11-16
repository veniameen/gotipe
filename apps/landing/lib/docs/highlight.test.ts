import { describe, expect, it } from "vitest";
import { SAMPLES } from "../../components/landing/code-sample";
import { highlightLines } from "./highlight";

describe("highlighting", () => {
  it("draws the landing's sample as frame 20 does", async () => {
    const react = SAMPLES.find((sample) => sample.tab === "React");
    const lines = await highlightLines(react?.text.trimEnd() ?? "", "tsx");
    const html = lines.join("\n");
    expect(html).toContain("<span class=k>export function </span><span class=t>Notes</span>");
    expect(html).toContain('<span class=s>"@gotipe/react"</span>');
    expect(html).toMatch(/<span class=p>[^<]*=&gt;/);
    expect(html).not.toMatch(/<span class=k>[^<]*=&gt;/);
    expect(html).toContain("<span class=t>BlockEditor</span>");
  });

  it("highlights every tab of the landing's panel in its own language", async () => {
    for (const sample of SAMPLES) {
      const html = (await highlightLines(sample.text.trimEnd(), sample.language)).join("\n");
      expect(html, sample.tab).toContain("<span class=s>");
      expect(html, sample.tab).toContain("@gotipe/");
    }
  });

  it("keeps an unknown language as escaped text", async () => {
    expect(await highlightLines("a < b\nc", "nope")).toEqual(["a &lt; b", "c"]);
  });
});
