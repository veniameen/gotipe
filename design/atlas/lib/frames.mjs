// A frame is written once: `<!-- @frame frame=… view=… w=… -->…<!-- @end -->` becomes a stage with
// the editor's root inside; the page's theme switch draws every frame light or dark.
//   frame  — the frame's name (data-frame), required
//   view   — minimal | modern | notion | docs, required
//   w      — frame width: 320, 375, 480, 768, 1024 or 1440
//   h      — fixed height, a screen cut at the bottom; min — least height of a component frame
//   label  — what the frame shows
const FRAME = /<!--\s*@frame\s+([^>]*?)\s*-->([\s\S]*?)<!--\s*@end\s*-->/g;
const ATTR = /(\w+)=(?:"([^"]*)"|(\S+))/g;
const WIDTHS = new Set(["320", "375", "480", "768", "1024", "1440"]);
const SCREENS = new Set(["320", "375", "768", "1024", "1440"]);

function attributes(text, where) {
  const out = {};
  for (const m of text.matchAll(ATTR)) out[m[1]] = m[2] ?? m[3];
  for (const key of ["frame", "view", "w"]) {
    if (!out[key]) throw new Error(`${where}: @frame without ${key}`);
  }
  if (!WIDTHS.has(out.w)) throw new Error(`${where}: @frame w=${out.w} is not a frame width`);
  return out;
}

export function expandFrames(html, where) {
  return html.replace(FRAME, (_, attrText, content) => {
    const a = attributes(attrText, where);
    const size = [`data-w="${a.w}"`, a.h && `data-h="${a.h}"`, a.min && `data-min="${a.min}"`]
      .filter(Boolean)
      .join(" ");
    const label = [a.label, SCREENS.has(a.w) && a.w].filter(Boolean).join(" · ");
    return [
      `<section class="at-stage" data-w="${a.w}">`,
      label ? `<p class="at-stage-label">${label}</p>` : "",
      `<div class="at-frame gotipe-root" data-gt-view="${a.view}" data-frame="${a.frame}" ${size}>`,
      content.trim(),
      "</div>",
      "</section>",
    ]
      .filter(Boolean)
      .join("\n");
  });
}
