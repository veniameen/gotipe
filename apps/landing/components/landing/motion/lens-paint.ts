/**
 * Painting the Markdown lens: where the files' lines stand on the stage, the source layer (dim
 * mono text, its syntax tinted) and the document layer the lens reveals (the same lines as headings,
 * lists, tasks, quotes, code and tables, in the site's type). Colours come from the theme's
 * `--site-lens-*` tokens; the layers are painted once and drawn every frame (hero-lens.tsx).
 */

import { LENS_FILES, type ReadLine, type Run, readLines, syntaxOf } from "./lens-content";

/** One line per row; the first row's top; the stage's side room; the room between columns; the
    characters a column is planned for. */
export const ROW = 22;
const TOP = 26;
const SIDE = 24;
const GUTTER = 56;
const COLUMN_CHARS = 60;
/** The band under the head where the field fades in. */
const HEAD_BAND = 96;
/** Below this stage width the copy fills the stage: the lens makes no round of its own. */
export const NARROW = 640;
/** How much a line's text sits below its row's top (the baseline). */
const BASELINE = 15;

export const MONO = "12px 'JetBrains Mono', ui-monospace, Menlo, monospace";
const INTER = "Inter, system-ui, -apple-system, sans-serif";

export interface LensColours {
  source: string;
  mark: string;
  ink: string;
  quiet: string;
  accent: string;
  fill: string;
  ring: string;
  code: string;
}

/** The lens's colours from the theme (`--site-lens-*`), or null while the tokens are missing. */
export function readLensColours(element: HTMLElement): LensColours | null {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(`--site-lens-${name}`).trim();
  const colours: LensColours = {
    source: token("source"),
    mark: token("mark"),
    ink: token("ink"),
    quiet: token("quiet"),
    accent: token("accent"),
    fill: token("fill"),
    ring: token("ring"),
    code: token("code"),
  };
  return Object.values(colours).every(Boolean) ? colours : null;
}

export interface PlacedLine {
  x: number;
  /** The top of the line's row. */
  y: number;
  /** The column's width: a line is cut at it. */
  width: number;
  source: string;
  read: ReadLine;
  inCode: boolean;
  column: number;
}

const READ = LENS_FILES.map((file) => readLines(file));

/**
 * The field: columns of the files side by side across the stage, as many as fit a line of about 60
 * characters, each a little wider or narrower to share the width; each column starts at another
 * line of its file.
 */
export function placeLines(width: number, height: number, charWidth: number): PlacedLine[] {
  const room = width - 2 * SIDE;
  const count = Math.max(1, Math.round((room + GUTTER) / (COLUMN_CHARS * charWidth + GUTTER)));
  const columnWidth = (room - (count - 1) * GUTTER) / count;
  const rows = Math.max(0, Math.ceil((height - TOP) / ROW));
  const lines: PlacedLine[] = [];
  for (let column = 0; column < count; column += 1) {
    const file = LENS_FILES[column % LENS_FILES.length] ?? [];
    const read = READ[column % READ.length] ?? [];
    const offset = (column * 7) % Math.max(file.length, 1);
    for (let row = 0; row < rows; row += 1) {
      const at = (row + offset) % file.length;
      const line = read[at];
      if (!line) continue;
      lines.push({
        x: SIDE + column * (columnWidth + GUTTER),
        y: TOP + row * ROW,
        width: columnWidth,
        source: file[at] ?? "",
        read: line,
        inCode: line.kind === "code",
        column,
      });
    }
  }
  return lines;
}

/** Paints inside a line's own box: a long line ends at its column. */
export function withinLine(ctx: CanvasRenderingContext2D, line: PlacedLine, paint: () => void) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(line.x - 4, line.y, line.width + 8, ROW);
  ctx.clip();
  paint();
  ctx.restore();
}

/** One source line: plain characters dim, syntax a step brighter. */
export function paintSourceLine(
  ctx: CanvasRenderingContext2D,
  line: PlacedLine,
  colours: LensColours,
  charWidth: number,
) {
  if (!line.source) return;
  withinLine(ctx, line, () => {
    ctx.font = MONO;
    const baseline = line.y + BASELINE;
    let at = 0;
    for (const [from, to] of [
      ...syntaxOf(line.source, line.inCode),
      [line.source.length, line.source.length] as [number, number],
    ]) {
      if (from > at) {
        ctx.fillStyle = colours.source;
        ctx.fillText(line.source.slice(at, from), line.x + at * charWidth, baseline);
      }
      if (to > from) {
        ctx.fillStyle = colours.mark;
        ctx.fillText(line.source.slice(from, to), line.x + from * charWidth, baseline);
      }
      at = Math.max(at, to);
    }
  });
}

/** The oval over the copy where the field calms down; a phone's copy fills its width, so does it. */
function laneOf(width: number, height: number) {
  const screen = Math.min(height, 900);
  return {
    x: width / 2,
    y: screen * 0.38,
    rx: width < NARROW ? width * 0.8 : Math.min(width * 0.4, 560),
    ry: screen * 0.42,
  };
}

/**
 * How much of the field is left at a point after the calm (1 — all of it): what the canvas draws
 * over the field each frame (the typed line's caret) fades the same way.
 */
export function fieldLeftAt(x: number, y: number, width: number, height: number): number {
  const lane = laneOf(width, height);
  const t = Math.hypot((x - lane.x) / lane.rx, (y - lane.y) / lane.ry);
  const erased = t >= 1 ? 0 : t <= 0.7 ? 0.94 - (0.94 - 0.78) * (t / 0.7) : 0.78 * ((1 - t) / 0.3);
  const head = y >= HEAD_BAND ? 0 : 1 - y / HEAD_BAND;
  return (1 - erased) * (1 - head);
}

/** Calms the field behind the headline: the source fades out in an oval over the copy. */
export function calmLane(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const lane = laneOf(width, height);
  ctx.translate(lane.x, lane.y);
  ctx.scale(lane.rx, lane.ry);
  const fade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  fade.addColorStop(0, "rgba(0, 0, 0, 0.94)");
  fade.addColorStop(0.7, "rgba(0, 0, 0, 0.78)");
  fade.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = fade;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
  // the head stands over the stage's top: the field fades in below it
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const band = ctx.createLinearGradient(0, 0, 0, HEAD_BAND);
  band.addColorStop(0, "rgba(0, 0, 0, 1)");
  band.addColorStop(0.55, "rgba(0, 0, 0, 0.85)");
  band.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, width, HEAD_BAND);
  ctx.restore();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

interface Look {
  size: number;
  weight: number;
  colour: string;
}

/** Runs of a line from `x` on its baseline; returns where the text ends. */
function paintRuns(
  ctx: CanvasRenderingContext2D,
  runs: Run[],
  x: number,
  baseline: number,
  look: Look,
  colours: LensColours,
): number {
  let pen = x;
  for (const run of runs) {
    if (!run.text) continue;
    if (run.code) {
      ctx.font = MONO;
      const width = ctx.measureText(run.text).width;
      ctx.fillStyle = colours.code;
      roundedRect(ctx, pen - 1, baseline - 12, width + 8, 17, 4);
      ctx.fill();
      ctx.fillStyle = colours.accent;
      ctx.fillText(run.text, pen + 3, baseline);
      pen += width + 10;
      continue;
    }
    ctx.font = `${run.italic ? "italic " : ""}${run.bold ? 650 : look.weight} ${look.size}px ${INTER}`;
    const width = ctx.measureText(run.text).width;
    ctx.fillStyle = run.strike ? colours.quiet : look.colour;
    ctx.fillText(run.text, pen, baseline);
    if (run.strike) {
      ctx.fillRect(pen, baseline - look.size * 0.32, width, 1);
    }
    pen += width;
  }
  return pen;
}

function paintCheck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  done: boolean,
  colours: LensColours,
) {
  roundedRect(ctx, x, y + 5, 12, 12, 3);
  if (done) {
    ctx.fillStyle = colours.accent;
    ctx.fill();
    ctx.strokeStyle = colours.fill;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 11);
    ctx.lineTo(x + 5.2, y + 13.2);
    ctx.lineTo(x + 9.2, y + 8.6);
    ctx.stroke();
  } else {
    ctx.strokeStyle = colours.quiet;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

/** One line as the document draws it. */
export function paintDocumentLine(
  ctx: CanvasRenderingContext2D,
  line: PlacedLine,
  colours: LensColours,
  _charWidth: number,
) {
  withinLine(ctx, line, () => paintBlock(ctx, line, colours));
}

function paintBlock(ctx: CanvasRenderingContext2D, line: PlacedLine, colours: LensColours) {
  const { read, x, y } = line;
  const baseline = y + BASELINE;
  const text: Look = { size: 13, weight: 400, colour: colours.ink };
  switch (read.kind) {
    case "h1":
      paintRuns(
        ctx,
        read.runs,
        x,
        baseline + 1,
        { size: 18, weight: 650, colour: colours.ink },
        colours,
      );
      return;
    case "h2":
      paintRuns(
        ctx,
        read.runs,
        x,
        baseline,
        { size: 15, weight: 650, colour: colours.ink },
        colours,
      );
      return;
    case "h3":
      paintRuns(
        ctx,
        read.runs,
        x,
        baseline,
        { size: 13, weight: 650, colour: colours.ink },
        colours,
      );
      return;
    case "para":
      paintRuns(ctx, read.runs, x, baseline, text, colours);
      return;
    case "bullet":
      ctx.fillStyle = colours.quiet;
      ctx.beginPath();
      ctx.arc(x + 4, y + 11, 2, 0, Math.PI * 2);
      ctx.fill();
      paintRuns(ctx, read.runs, x + 16, baseline, text, colours);
      return;
    case "ordered":
      paintRuns(
        ctx,
        [{ text: read.marker ?? "" }],
        x,
        baseline,
        { ...text, colour: colours.quiet },
        colours,
      );
      paintRuns(ctx, read.runs, x + 18, baseline, text, colours);
      return;
    case "todo":
    case "done":
      paintCheck(ctx, x, y, read.kind === "done", colours);
      paintRuns(
        ctx,
        read.kind === "done" ? read.runs.map((run) => ({ ...run, strike: true })) : read.runs,
        x + 20,
        baseline,
        text,
        colours,
      );
      return;
    case "quote":
      ctx.fillStyle = colours.accent;
      ctx.fillRect(x, y + 3, 2, ROW - 6);
      paintRuns(
        ctx,
        read.runs.map((run) => ({ ...run, italic: true })),
        x + 12,
        baseline,
        { ...text, colour: colours.quiet },
        colours,
      );
      return;
    case "callout":
      ctx.fillStyle = colours.accent;
      ctx.fillRect(x, y + 3, 2, ROW - 3);
      paintRuns(
        ctx,
        [{ text: read.marker ?? "", bold: true }],
        x + 12,
        baseline,
        { ...text, colour: colours.accent },
        colours,
      );
      return;
    case "code":
      ctx.font = MONO;
      ctx.fillStyle = colours.ink;
      ctx.fillText(read.runs[0]?.text ?? "", x + 10, baseline);
      return;
    case "table": {
      const cells = read.cells ?? [];
      const cell = Math.min(line.width / Math.max(cells.length, 1), 140);
      cells.forEach((runs, index) => {
        paintRuns(
          ctx,
          runs,
          x + index * cell,
          baseline,
          {
            ...text,
            weight: read.header ? 650 : 400,
            colour: read.header ? colours.ink : colours.quiet,
          },
          colours,
        );
      });
      ctx.fillStyle = colours.code;
      ctx.fillRect(x, y + ROW - 1, cell * cells.length, 1);
      return;
    }
    default:
      return;
  }
}

/** The code blocks' ground: one rounded block over each run of fence and code rows. */
export function paintCodeGrounds(
  ctx: CanvasRenderingContext2D,
  lines: PlacedLine[],
  colours: LensColours,
) {
  let start: PlacedLine | null = null;
  let last: PlacedLine | null = null;
  const close = () => {
    if (start && last) {
      ctx.fillStyle = colours.code;
      roundedRect(ctx, start.x - 2, start.y + 4, start.width, last.y - start.y + ROW - 8, 8);
      ctx.fill();
    }
    start = null;
    last = null;
  };
  for (const line of lines) {
    const inBlock = line.read.kind === "code" || line.read.kind === "fence";
    const continues =
      last !== null &&
      line.column === (last as PlacedLine).column &&
      line.y === (last as PlacedLine).y + ROW;
    if (inBlock && (start === null || continues)) {
      if (start === null) start = line;
      last = line;
    } else {
      close();
      if (inBlock) {
        start = line;
        last = line;
      }
    }
  }
  close();
}
