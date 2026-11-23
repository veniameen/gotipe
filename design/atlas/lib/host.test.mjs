// A host's parts (host.mjs): host.json is checked, and the host's parts follow the library's in
// the page. node --test design/atlas/lib/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { parseHost, partsOf } from "./host.mjs";

const library = {
  tokens: ["tokens.css"],
  styles: ["atlas.css", "content/diagram.css"],
  icons: ["icons.svg"],
  figures: ["figures/01-notion.html", "figures/02-docs.html"],
};

test("without a host the page holds the library's parts alone", () => {
  assert.deepEqual(partsOf(library, null), {
    tokens: ["tokens.css"],
    styles: ["tokens.css", "atlas.css", "content/diagram.css"],
    icons: ["icons.svg"],
    figures: ["figures/01-notion.html", "figures/02-docs.html"],
  });
});

test("a host's tokens follow the library's, its styles and icons follow, its figures alone", () => {
  const host = parseHost(
    JSON.stringify({
      tokens: ["tokens-host.css"],
      styles: ["host/page.css"],
      icons: ["host/icons.svg"],
      figures: ["figures/40-home.html"],
    }),
  );
  assert.deepEqual(partsOf(library, host), {
    tokens: ["tokens.css", "tokens-host.css"],
    styles: ["tokens.css", "tokens-host.css", "atlas.css", "content/diagram.css", "host/page.css"],
    icons: ["icons.svg", "host/icons.svg"],
    figures: ["figures/40-home.html"],
  });
});

test("a key a host leaves out is an empty list", () => {
  const host = parseHost('{ "figures": ["figures/40-home.html"] }');
  assert.deepEqual(host, { tokens: [], styles: [], icons: [], figures: ["figures/40-home.html"] });
});

test("host.json that is not a list of part names fails with its reason", () => {
  assert.throws(() => parseHost("[]"), /host\.json: not an object/);
  assert.throws(() => parseHost('{ "figures": ["a.html"], "theme": [] }'), /unknown key `theme`/);
  assert.throws(() => parseHost('{ "figures": "a.html" }'), /`figures` is not a list/);
  assert.throws(
    () => parseHost('{ "styles": [""], "figures": ["a.html"] }'),
    /`styles` is not a list/,
  );
  assert.throws(() => parseHost('{ "styles": ["a.css"] }'), /`figures` names no figure/);
});
