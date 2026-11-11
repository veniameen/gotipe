// Russian typesetting for the atlas's prose: a short word keeps the next one on its line,
// a dash stays with the word before it, a percent sign with its number. Code, SVG and markup
// are left as they are.

const SKIP = new Set(["pre", "code", "svg", "style", "script", "title"]);
const SHORT =
  /(^|[\s(«„—])(а|в|во|и|к|ко|о|об|с|со|у|до|за|из|на|не|но|по|от|для|при|без|под|над|или)\s+(?=\S)/giu;
const DASH = /([^\s>])\s+—(?=\s)/gu;
const PERCENT = /(\d)\s+%/gu;

function setText(text) {
  return text
    .replace(SHORT, (_, before, word) => `${before}${word} `)
    .replace(SHORT, (_, before, word) => `${before}${word} `)
    .replace(DASH, (_, before) => `${before} —`)
    .replace(PERCENT, (_, digit) => `${digit} %`);
}

/** Applies the rules to text between tags outside SKIP elements; tags pass through untouched. */
export function typeset(html) {
  const parts = html.split(/(<[^>]+>)/);
  const open = [];
  return parts
    .map((part) => {
      if (part.startsWith("<")) {
        const tag = /^<\/?\s*([a-z0-9-]+)/i.exec(part)?.[1]?.toLowerCase();
        if (tag && SKIP.has(tag) && !part.endsWith("/>")) {
          if (part.startsWith("</")) open.pop();
          else open.push(tag);
        }
        return part;
      }
      return open.length ? part : setText(part);
    })
    .join("");
}
