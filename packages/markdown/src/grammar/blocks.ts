import type { InlineAtoms } from "../types";
import {
  atx,
  htmlBlock,
  interrupts,
  listMarker,
  mathFence,
  openingFence,
  quotePrefix,
  thematic,
} from "./block-syntax";
import { decodeString } from "./decode";
import { readDefinition } from "./definitions";
import { readInline } from "./inline";
import type { InlineContext } from "./links";
import { lazyReading, readList } from "./lists";
import { type Line, blank, indentWidth, linesFrom, sourceFrom, strip, stripIndent } from "./source";
import { tableAlignment, tableCells, tableRow } from "./table";
import { type PhrasingContent, type Root, type RootContent, position } from "./types";

class Reader {
  readonly references = new Set<string>();
  readonly inlineJobs: (() => void)[] = [];

  constructor(readonly atoms?: InlineAtoms) {}

  inline(lines: Line[], options: Partial<InlineContext> = {}): PhrasingContent[] {
    const children: PhrasingContent[] = [];
    const context = { references: this.references, atoms: this.atoms, ...options };
    this.inlineJobs.push(() => children.push(...readInline(sourceFrom(lines), context)));
    return children;
  }

  blocks(lines: Line[], depth = 0, taskPrefix = 0): RootContent[] {
    const nodes: RootContent[] = [];
    if (depth > 64 && lines.length)
      return [
        {
          type: "html",
          value: sourceFrom(lines).text,
          position: position(lines[0]!.start, lines.at(-1)!.end),
        },
      ];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i]!;
      if (blank(line)) {
        i++;
        continue;
      }
      const start = line.start + /^ */.exec(line.text)![0].length;
      const opening = openingFence(line.text);
      if (opening) {
        const marker = opening[1]!;
        const close = new RegExp(
          `^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`,
        );
        const content: string[] = [];
        const indentation = line.text.indexOf(marker);
        let next = i + 1;
        while (next < lines.length && !close.test(lines[next]!.text)) {
          content.push(stripIndent(lines[next]!, indentation).text);
          next++;
        }
        const info = decodeString(opening[2]!.trim());
        // the meta is the rest, a "\r" of a reference too (JavaScript `.` would stop there)
        const split = /^(\S+)(?:[ \t]+([^\n]*))?$/.exec(info);
        const last = next < lines.length ? next++ : Math.max(i, next - 1);
        nodes.push({
          type: "code",
          value: content.join("\n"),
          lang: split?.[1] ?? null,
          meta: split?.[2] ?? null,
          position: position(start, lines[last]!.end),
        });
        i = next;
        continue;
      }
      // `$$` … `$$`: the body is taken raw, without inline parsing. Without a closing
      // line the `$$` stays ordinary paragraph text.
      const mathEnd = mathFence(line.text)
        ? lines.findIndex((candidate, index) => index > i && mathFence(candidate.text))
        : -1;
      if (mathEnd > 0) {
        const indentation = /^ */.exec(line.text)![0].length;
        nodes.push({
          type: "math",
          value: lines
            .slice(i + 1, mathEnd)
            .map((body) => stripIndent(body, indentation).text)
            .join("\n"),
          position: position(start, lines[mathEnd]!.end),
        });
        i = mathEnd + 1;
        continue;
      }
      const heading = atx(line.text);
      if (heading) {
        const prefix = heading[0].length - (heading[2]?.length ?? 0);
        const raw = heading[2] ?? "";
        // only spaces and tabs end the text: a no-break space at its end is text
        const value = raw.replace(/(?:^|[ \t]+)#+[ \t]*$/, "").replace(/[ \t]+$/, "");
        const content = {
          text: value,
          start: line.start + prefix,
          end: line.start + prefix + value.length,
        };
        nodes.push({
          type: "heading",
          depth: heading[1]!.length,
          children: this.inline([content]),
          position: position(start, line.end),
        });
        i++;
        continue;
      }
      if (thematic(line.text)) {
        nodes.push({ type: "thematicBreak", position: position(start, line.end) });
        i++;
        continue;
      }
      if (quotePrefix(line.text)) {
        const quoted: Line[] = [];
        // the first line of each run of lines without `>`: its index in the quote and in `lines`
        const lazy: { at: number; next: number }[] = [];
        let run = false;
        let next = i;
        for (; next < lines.length; next++) {
          const current = lines[next]!;
          const prefix = quotePrefix(current.text);
          if (prefix) {
            const marker = /^ {0,3}>/.exec(current.text)![0].length;
            quoted.push(stripIndent(strip(current, marker), prefix > marker ? 1 : 0));
            run = false;
            continue;
          }
          // a line that starts a block here — any list item too — ends the quote
          if (blank(current) || interrupts(current) || listMarker(current.text)) break;
          if (!run) lazy.push({ at: quoted.length, next });
          run = true;
          quoted.push({ ...current, lazy: true });
        }
        let children = this.blocks(quoted, depth + 1);
        // A line without `>` continues the paragraph the quote has open. Where the quote reads it
        // otherwise — after a blank line, in code or a table — the quote ends before it, as in
        // CommonMark (D-118); its blocks before that line read the same without it.
        for (const { at, next: stray } of lazy) {
          const reading = lazyReading(children, quoted[at]!.start, true);
          if (reading === "text") continue;
          quoted.length = at;
          children =
            typeof reading === "number"
              ? children.slice(0, reading)
              : this.blocks(quoted, depth + 1);
          next = stray;
          break;
        }
        nodes.push({
          type: "blockquote",
          children,
          position: position(start, lines[next - 1]!.end),
        });
        i = next;
        continue;
      }
      if (listMarker(line.text)) {
        const list = readList(lines, i, (children, prefix) =>
          this.blocks(children, depth + 1, prefix),
        );
        nodes.push(list.node);
        i = list.end;
        continue;
      }
      const html = htmlBlock(line.text);
      if (html !== false) {
        let next = i + 1;
        if (html) {
          if (!html.test(line.text))
            while (next < lines.length && !html.test(lines[next++]!.text)) {
              /* consume HTML body */
            }
        } else while (next < lines.length && !blank(lines[next]!)) next++;
        const last = lines[next - 1]!;
        const trailing =
          html && !html.test(last.text) && next === lines.length ? (last.eol ?? "") : "";
        nodes.push({
          type: "html",
          value:
            lines
              .slice(i, next)
              .map((l) => l.text)
              .join("\n") + trailing,
          position: position(start, last.end + trailing.length),
        });
        i = next;
        continue;
      }
      const definition = readDefinition(lines, i, this.references);
      if (definition) {
        nodes.push(definition.node);
        i = definition.end;
        continue;
      }
      if (indentWidth(line.text) >= 4) {
        const content: Line[] = [];
        let next = i;
        while (next < lines.length && (blank(lines[next]!) || indentWidth(lines[next]!.text) >= 4))
          content.push(stripIndent(lines[next++]!, 4));
        while (content.length && blank(content.at(-1)!)) {
          content.pop();
          next--;
        }
        nodes.push({
          type: "code",
          value: content.map((l) => l.text).join("\n"),
          position: position(
            line.start + Math.min(4, /^ */.exec(line.text)![0].length),
            content.at(-1)!.end,
          ),
        });
        i = next;
        continue;
      }
      // a lazy line continues text: it is no delimiter row (GFM)
      const delimiter = lines[i + 1];
      const alignment =
        delimiter && !delimiter.lazy && line.text.includes("|") ? tableAlignment(delimiter) : null;
      if (alignment && alignment.length === tableCells(line.text).length) {
        const row = (value: Line) =>
          tableRow(value, alignment.length, (cell, options) => this.inline([cell], options));
        const children = [row(line)];
        let next = i + 2;
        while (next < lines.length && !blank(lines[next]!) && !interrupts(lines[next]!))
          children.push(row(lines[next++]!));
        nodes.push({
          type: "table",
          align: alignment,
          children,
          position: position(start, lines[next - 1]!.end),
        });
        i = next;
        continue;
      }
      const paragraph: Line[] = [
        i === 0 && taskPrefix
          ? strip(line, taskPrefix)
          : stripIndent(line, Math.min(3, indentWidth(line.text))),
      ];
      let next = i + 1;
      let setext = 0;
      while (next < lines.length && !blank(lines[next]!)) {
        const current = lines[next]!;
        const underline = /^ {0,3}(=+|-+)[ \t]*$/.exec(current.text);
        if (underline && !current.lazy) {
          setext = underline[1]![0] === "=" ? 1 : 2;
          next++;
          break;
        }
        if (interrupts(current) && !current.lazy) break;
        paragraph.push(stripIndent(current, indentWidth(current.text, current.column)));
        next++;
      }
      // a task's text may start on the next line: the empty rest of the marker line is no line
      // of the paragraph, or its line ending would start the text with a space (D-91)
      if (i === 0 && taskPrefix && !setext && paragraph.length > 1 && blank(paragraph[0]!))
        paragraph.shift();
      const children = this.inline(paragraph);
      const pos = position(start, lines[next - 1]!.end);
      nodes.push(
        setext
          ? { type: "heading", depth: setext, children, position: pos }
          : { type: "paragraph", children, position: pos },
      );
      i = next;
    }
    return nodes;
  }
}

/** Where the blocks of `text` begin and end; their inline text is not read. */
export function readBlockNodes(text: string): RootContent[] {
  return new Reader().blocks(linesFrom(text));
}

/** Read block structure first, so references declared later resolve in earlier inline text. */
export function readMarkdown(text: string, atoms?: InlineAtoms): Root {
  const reader = new Reader(atoms);
  const children = reader.blocks(linesFrom(text));
  for (const read of reader.inlineJobs) read();
  return { type: "root", children };
}
