import {
  atx,
  fence,
  htmlBlock,
  interrupts,
  listMarker,
  quotePrefix,
  thematic,
} from "./block-syntax";
import { decodeString } from "./decode";
import { readDefinition } from "./definitions";
import { readInline } from "./inline";
import type { InlineContext } from "./links";
import { readList } from "./lists";
import { type Line, blank, indentWidth, linesFrom, sourceFrom, strip, stripIndent } from "./source";
import { tableAlignment, tableCells, tableRow } from "./table";
import { type PhrasingContent, type Root, type RootContent, position } from "./types";

class Reader {
  readonly references = new Set<string>();
  readonly inlineJobs: (() => void)[] = [];

  inline(lines: Line[], options: Partial<InlineContext> = {}): PhrasingContent[] {
    const children: PhrasingContent[] = [];
    this.inlineJobs.push(() =>
      children.push(...readInline(sourceFrom(lines), { references: this.references, ...options })),
    );
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
      const opening = fence(line.text);
      if (opening && !(opening[1]![0] === "`" && opening[2]!.includes("`"))) {
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
        const split = /^(\S+)(?:[ \t]+(.*))?$/.exec(info);
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
      const heading = atx(line.text);
      if (heading) {
        const prefix = heading[0].length - (heading[2]?.length ?? 0);
        const raw = heading[2] ?? "";
        const value = raw.replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trimEnd();
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
        let next = i;
        let lazy = false;
        while (next < lines.length) {
          const current = lines[next]!;
          const prefix = quotePrefix(current.text);
          if (prefix) {
            const marker = /^ {0,3}>/.exec(current.text)![0].length;
            const unquoted = stripIndent(strip(current, marker), prefix > marker ? 1 : 0);
            quoted.push(unquoted);
            let inner = unquoted;
            for (let n = 0; n < 64; n++) {
              const quote = quotePrefix(inner.text);
              const list = listMarker(inner.text, inner.column);
              if (quote) inner = strip(inner, quote);
              else if (list) inner = strip(inner, list.prefix);
              else break;
            }
            lazy = !blank(inner) && indentWidth(inner.text, inner.column) < 4 && !interrupts(inner);
          } else if (lazy && !blank(current) && !interrupts(current))
            quoted.push({ ...current, lazy: true });
          else break;
          next++;
        }
        nodes.push({
          type: "blockquote",
          children: this.blocks(quoted, depth + 1),
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
      const alignment =
        i + 1 < lines.length && line.text.includes("|") ? tableAlignment(lines[i + 1]!) : null;
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

/** Read block structure first, so references declared later resolve in earlier inline text. */
export function readMarkdown(text: string): Root {
  const reader = new Reader();
  const children = reader.blocks(linesFrom(text));
  for (const read of reader.inlineJobs) read();
  return { type: "root", children };
}
