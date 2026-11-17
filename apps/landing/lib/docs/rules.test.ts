import { describe, expect, it } from "vitest";
import {
  createSlugger,
  headingSlug,
  internalTarget,
  parseFenceMeta,
  readmeDemoNames,
  splitFrontMatter,
} from "./rules.mjs";

const page = (front: string) => `---\n${front}\n---\n\nBody.\n`;

describe("front matter", () => {
  it("reads strings, quoted strings and lists", () => {
    const { data, body, errors } = splitFrontMatter(
      page(
        'title: Tables\ndescription: "One: sentence."\npackages: ["@gotipe/core"]\nlicense: MIT',
      ),
    );
    expect(errors).toEqual([]);
    expect(data).toEqual({
      title: "Tables",
      description: "One: sentence.",
      packages: ["@gotipe/core"],
      license: "MIT",
    });
    expect(body).toBe("\nBody.\n");
  });

  it("explains bad input instead of throwing", () => {
    const quoted = splitFrontMatter(page('title: "Tables" vs "Grids"\ndescription: x'));
    expect(quoted.errors).toEqual([
      expect.stringContaining("`title` is not one quoted string"),
      "front matter has no title",
    ]);
    const packages = splitFrontMatter(page("title: T\ndescription: D\npackages: x"));
    expect(packages.errors).toEqual(["front matter `packages` is not a list of package names"]);
    const list = splitFrontMatter(page("title: T\ndescription: D\npackages: [1]"));
    expect(list.errors[0]).toContain("not a JSON list of strings");
    expect(splitFrontMatter(page("title: T\ndescription: D\nlicense: GPL")).errors[0]).toContain(
      "not MIT or Commercial",
    );
    expect(splitFrontMatter(page("description: D")).errors).toEqual(["front matter has no title"]);
    expect(splitFrontMatter("No front matter.").errors).toEqual(["no front matter"]);
    expect(splitFrontMatter(page("title: T\ndescription: Use `x`")).errors).toEqual([
      "front matter `description` holds Markdown",
    ]);
  });
});

describe("heading ids", () => {
  it("follow GitHub: lower case, punctuation dropped, spaces as hyphens", () => {
    expect(headingSlug("The find bar of BlockEditor")).toBe("the-find-bar-of-blockeditor");
    expect(headingSlug("insertTable({ rows })")).toBe("inserttable-rows-");
    expect(headingSlug("Éditer la table")).toBe("éditer-la-table");
    expect(headingSlug("Über emoji 🎉")).toBe("über-emoji-");
  });

  it("number repeated headings within a page", () => {
    const slug = createSlugger();
    expect([slug("Usage"), slug("Usage"), slug("Usage"), slug("!!!")]).toEqual([
      "usage",
      "usage-1",
      "usage-2",
      "section",
    ]);
  });
});

describe("internal links", () => {
  it("split a docs path into its page and anchor", () => {
    expect(internalTarget("/docs/concepts/commands#chain", "a/b")).toEqual({
      slug: "concepts/commands",
      anchor: "chain",
    });
    expect(internalTarget("/docs/concepts/commands/", "a/b")).toEqual({
      slug: "concepts/commands",
      anchor: "",
    });
    expect(internalTarget("#%C3%A9", "a/b")).toEqual({ slug: "a/b", anchor: "é" });
  });

  it("keep a malformed anchor as written and leave other links alone", () => {
    expect(internalTarget("#100%", "a/b")).toEqual({ slug: "a/b", anchor: "100%" });
    expect(internalTarget("https://example.com/docs/x", "a/b")).toBeNull();
    expect(internalTarget("mailto:a@b.c", "a/b")).toBeNull();
  });
});

describe("fences and demos", () => {
  it("read the title and tab of a fence", () => {
    expect(parseFenceMeta('title="editor.ts" tab="React"')).toEqual({
      title: "editor.ts",
      tab: "React",
    });
    expect(parseFenceMeta("tab=Vue other=1")).toEqual({ tab: "Vue" });
    expect(parseFenceMeta(undefined)).toEqual({});
  });

  it("read the README's demo names", () => {
    const readme = "- **Live demo**: … Names: `tables`,\n  `ai`, `i18n`. At most one per page.";
    expect(readmeDemoNames(readme)).toEqual(["tables", "ai", "i18n"]);
  });
});
