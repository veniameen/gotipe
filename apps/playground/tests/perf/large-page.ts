/**
 * A deterministic long GFM page (a wiki-like document): headings, paragraphs, bullet, ordered and
 * task lists, tables, code and quotes. The same `sections` always gives the same bytes.
 */
const WORDS = [
  "editor",
  "document",
  "block",
  "caret",
  "selection",
  "history",
  "table",
  "column",
  "render",
  "session",
  "serializer",
  "markdown",
  "heading",
  "paragraph",
  "review",
  "comment",
  "version",
  "schema",
  "transaction",
  "offset",
  "layout",
  "theme",
  "token",
  "handle",
  "menu",
  "keyboard",
];

function generator(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const word = () => WORDS[next() % WORDS.length] as string;
  const words = (count: number) => Array.from({ length: count }, word).join(" ");
  return { next, word, words };
}

/** `sections` 236 gives about 258 KiB and 7,384 blocks; 2 gives a small page. */
export function largePage(sections: number, seed = 20261118): string {
  const { next, word, words } = generator(seed);
  const out: string[] = ["# Long page", "", `Generated page of ${sections} sections.`, ""];
  for (let s = 1; s <= sections; s += 1) {
    out.push(`## Section ${s}: ${words(3)}`, "");
    out.push(
      `The **${word()}** keeps \`${word()}\` and [${word()}](https://example.com/${s}).`,
      "",
    );
    out.push(`${words(30)}.`, "");
    for (let i = 0; i < 4; i += 1) out.push(`- ${words(4)}`);
    out.push(`  - ${words(3)}`, `  - ${words(3)}`, "");
    for (let i = 1; i <= 3; i += 1) out.push(`${i}. ${words(4)}`);
    out.push("");
    for (let i = 0; i < 3; i += 1) out.push(`- [${next() % 2 ? "x" : " "}] ${words(3)}`);
    out.push("");
    out.push(`### Details ${s}`, "", `${words(10)} *${word()}* ~~${word()}~~.`, "");
    if (s % 2 === 0) {
      out.push(`| ${word()} | ${word()} | ${word()} |`, "| --- | :-: | --: |");
      for (let r = 0; r < 3; r += 1) out.push(`| ${word()} | ${words(2)} | ${next() % 1000} |`);
      out.push("");
    }
    if (s % 3 === 0) {
      out.push("```ts", `const ${word()} = ${next() % 100};`, `export { ${word()} };`, "```", "");
    }
    if (s % 4 === 0) out.push(`> ${words(8)}`, `> ${words(5)}`, "");
    if (s % 5 === 0) out.push("---", "");
    out.push(`${words(20)}.`, "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
