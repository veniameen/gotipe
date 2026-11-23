// The rules of a documentation page (rules.mjs). node --test scripts/docs-site/rules.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSlugger,
  headingSlug,
  internalTarget,
  plainText,
  readmeDemoNames,
  splitFrontMatter,
} from "./rules.mjs";

const page = (front) => `---\n${front}\n---\n\nBody.\n`;

describe("front matter", () => {
  it("reads strings, quoted strings and lists", () => {
    const { data, body, errors } = splitFrontMatter(
      page(
        'title: Tables\ndescription: "One: sentence."\npackages: ["@gotipe/core"]\nlicense: MIT',
      ),
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(data, {
      title: "Tables",
      description: "One: sentence.",
      packages: ["@gotipe/core"],
      license: "MIT",
    });
    assert.equal(body, "\nBody.\n");
  });

  it("explains bad input instead of throwing", () => {
    const quoted = splitFrontMatter(page('title: "Tables" vs "Grids"\ndescription: x'));
    assert.equal(quoted.errors.length, 2);
    assert.match(quoted.errors[0], /`title` is not one quoted string/);
    assert.equal(quoted.errors[1], "front matter has no title");
    assert.deepEqual(splitFrontMatter(page("title: T\ndescription: D\npackages: x")).errors, [
      "front matter `packages` is not a list of package names",
    ]);
    assert.match(
      splitFrontMatter(page("title: T\ndescription: D\npackages: [1]")).errors[0],
      /not a JSON list of strings/,
    );
    assert.match(
      splitFrontMatter(page("title: T\ndescription: D\nlicense: GPL")).errors[0],
      /not MIT or Commercial/,
    );
    assert.deepEqual(splitFrontMatter(page("description: D")).errors, [
      "front matter has no title",
    ]);
    assert.deepEqual(splitFrontMatter("No front matter.").errors, ["no front matter"]);
    assert.deepEqual(splitFrontMatter(page("title: T\ndescription: Use `x`")).errors, [
      "front matter `description` holds Markdown",
    ]);
  });
});

describe("heading ids", () => {
  it("follow GitHub: lower case, punctuation dropped, spaces as hyphens", () => {
    assert.equal(headingSlug("The find bar of BlockEditor"), "the-find-bar-of-blockeditor");
    assert.equal(headingSlug("insertTable({ rows })"), "inserttable-rows-");
    assert.equal(headingSlug("Éditer la table"), "éditer-la-table");
    assert.equal(headingSlug("Über emoji 🎉"), "über-emoji-");
    assert.equal(headingSlug("Таблицы и списки"), "таблицы-и-списки");
  });

  it("number repeated headings within a page", () => {
    const slug = createSlugger();
    assert.deepEqual(
      [slug("Usage"), slug("Usage"), slug("Usage"), slug("!!!")],
      ["usage", "usage-1", "usage-2", "section"],
    );
  });

  it("read a heading's text on one line, a hard break as a space", () => {
    assert.equal(plainText([{ text: "Two\nlines" }, { text: " here" }]), "Two lines here");
    assert.equal(plainText("raw"), "raw");
    assert.equal(plainText(null), "");
  });
});

describe("internal links", () => {
  it("split a docs path into its page and anchor", () => {
    assert.deepEqual(internalTarget("/docs/concepts/commands#chain", "a/b"), {
      slug: "concepts/commands",
      anchor: "chain",
    });
    assert.deepEqual(internalTarget("/docs/concepts/commands/", "a/b"), {
      slug: "concepts/commands",
      anchor: "",
    });
    assert.deepEqual(internalTarget("#%C3%A9", "a/b"), { slug: "a/b", anchor: "é" });
  });

  it("keep a malformed anchor as written and leave other links alone", () => {
    assert.deepEqual(internalTarget("#100%", "a/b"), { slug: "a/b", anchor: "100%" });
    assert.equal(internalTarget("https://example.com/docs/x", "a/b"), null);
    assert.equal(internalTarget("mailto:a@b.c", "a/b"), null);
  });
});

describe("demos", () => {
  it("read the README's demo names", () => {
    const readme = "- **Live demo**: … Names: `tables`,\n  `ai`, `i18n`. At most one per page.";
    assert.deepEqual(readmeDemoNames(readme), ["tables", "ai", "i18n"]);
    assert.deepEqual(readmeDemoNames("No list here."), []);
  });
});
