import type { ComponentType } from "react";

export type PartIconName =
  | "block"
  | "page"
  | "comments"
  | "versions"
  | "ai"
  | "export"
  | "migration"
  | "views"
  | "cloud";

type Tone = "hi" | "mid" | "lo" | "cyan";
/** A gradient stop: where it sits, its tone and, where the tone fades, its opacity. */
type Stop = readonly [offset: number, tone: Tone, opacity?: number];

// the recipes: the front shape runs from the second hue through the main blue into the deep one;
// shapes behind keep the main blue and deepen at the far end; the shine is the light tone fading
// out from the top left, where the light comes from; light runs the light tone into the second hue
const FRONT: Stop[] = [
  [0, "cyan"],
  [0.6, "mid"],
  [1, "lo"],
];
const BACK: Stop[] = [
  [0, "mid"],
  [0.5, "mid"],
  [1, "lo"],
];
const DEEP: Stop[] = [
  [0, "mid"],
  [1, "lo"],
];
const SHINE: Stop[] = [
  [0, "hi", 0.85],
  [1, "hi", 0],
];
const LIGHT: Stop[] = [
  [0, "hi"],
  [1, "cyan"],
];
const INK: Stop[] = [
  [0, "hi"],
  [1, "hi", 0.8],
];
const GLOW: Stop[] = [
  [0, "cyan", 0.35],
  [1, "cyan", 0],
];

/** Every colour is a stop with a tone class; the site's tokens colour the classes per theme. */
const stops = (list: readonly Stop[]) =>
  list.map(([offset, tone, opacity]) => (
    <stop key={offset} offset={offset} className={`site-glyph-${tone}`} stopOpacity={opacity} />
  ));

/** A linear gradient in the icon's own 48-unit space, from (x1, y1) to (x2, y2). */
function Linear(props: { id: string; at: readonly [number, number, number, number]; of: Stop[] }) {
  const [x1, y1, x2, y2] = props.at;
  return (
    <linearGradient id={props.id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
      {stops(props.of)}
    </linearGradient>
  );
}

/** A radial gradient in the icon's own 48-unit space, around (cx, cy). */
function Radial(props: { id: string; at: readonly [number, number, number]; of: Stop[] }) {
  const [cx, cy, r] = props.at;
  return (
    <radialGradient id={props.id} cx={cx} cy={cy} r={r} gradientUnits="userSpaceOnUse">
      {stops(props.of)}
    </radialGradient>
  );
}

/** Keeps everything but `outline`: the gap that sets a shape in front off the ones behind. */
function Cut({ id, outline }: { id: string; outline: string }) {
  return (
    <clipPath id={id}>
      <path clipRule="evenodd" d={`M-4 -4H52V52H-4Z${outline}`} />
    </clipPath>
  );
}

/** An icon's gradient and clip ids (gt-part-<name>-<role>) and references to them. */
function scope(name: PartIconName) {
  const id = (role: string) => `gt-part-${name}-${role}`;
  return { id, url: (role: string) => `url(#${id(role)})` };
}

/** Block editor: three blocks, the middle one lifted to the front, with its drag handle. */
function Block() {
  const { id, url } = scope("block");
  return (
    <>
      <defs>
        <Linear id={id("front")} at={[13, 17, 44, 30]} of={FRONT} />
        <Radial id={id("shine")} at={[16, 17, 20]} of={SHINE} />
        <Linear id={id("back")} at={[14, 6, 40, 41]} of={BACK} />
        <Linear id={id("ink")} at={[18, 22, 33, 25]} of={INK} />
        <Linear id={id("dot")} at={[3, 18, 11, 30]} of={BACK} />
      </defs>
      <rect x="14" y="6" width="26" height="8" rx="3.5" fill={url("back")} opacity="0.5" />
      <rect x="14" y="33" width="19" height="8" rx="3.5" fill={url("back")} opacity="0.5" />
      <rect x="13" y="17" width="31" height="13" rx="4.5" fill={url("front")} />
      <rect x="13" y="17" width="31" height="13" rx="4.5" fill={url("shine")} />
      <rect x="18.5" y="22" width="14" height="3" rx="1.5" fill={url("ink")} />
      {[19, 23.5, 28].flatMap((cy) =>
        [4.5, 9].map((cx) => (
          <circle key={`${cx} ${cy}`} cx={cx} cy={cy} r="1.6" fill={url("dot")} />
        )),
      )}
    </>
  );
}

/** Page editor: a page of text with a folded corner and a comment over its lower corner. */
function Page() {
  const { id, url } = scope("page");
  const page =
    "M11.5 5H21.5Q22.5 5 23.21 5.71L30.29 12.79Q31 13.5 31 14.5V36.5A4.5 4.5 0 0 1 26.5 41H11.5A4.5 4.5 0 0 1 7 36.5V9.5A4.5 4.5 0 0 1 11.5 5Z";
  return (
    <>
      <defs>
        <Linear id={id("front")} at={[7, 5, 31, 41]} of={FRONT} />
        <Radial id={id("shine")} at={[11, 8.5, 22]} of={SHINE} />
        <Linear id={id("ink")} at={[11, 13, 27, 28]} of={INK} />
        <Linear id={id("note")} at={[21, 23, 42, 43]} of={LIGHT} />
        <Cut
          id={id("cut")}
          outline="M27 22H35A7 7 0 0 1 42 29V55A7 7 0 0 1 35 62H27A7 7 0 0 1 20 55V29A7 7 0 0 1 27 22Z"
        />
      </defs>
      <g clipPath={url("cut")}>
        <path d={page} fill={url("front")} />
        <path d={page} fill={url("shine")} />
        <path d="M22.5 5V11.5Q22.5 13.5 24.5 13.5H31Z" fill={url("ink")} opacity="0.9" />
        <rect x="12" y="13" width="8" height="3" rx="1.5" fill={url("ink")} />
        <rect x="12" y="19" width="15" height="3" rx="1.5" fill={url("ink")} />
        <rect x="12" y="25" width="7" height="3" rx="1.5" fill={url("ink")} />
      </g>
      <path
        d="M27 24H35A5 5 0 0 1 40 29V33Q40 39.8 41.5 42Q38 38.6 31.75 38H27A5 5 0 0 1 22 33V29A5 5 0 0 1 27 24Z"
        fill={url("note")}
      />
    </>
  );
}

/** Comments and suggestions: a bright speech bubble with three dots over a deeper one. */
function Comments() {
  const { id, url } = scope("comments");
  const bubble =
    "M22.5 16H35.5A7.5 7.5 0 0 1 43 23.5V29.5Q43 39.03 44.5 41.5Q40 37.6 32 37H22.5A7.5 7.5 0 0 1 15 29.5V23.5A7.5 7.5 0 0 1 22.5 16Z";
  return (
    <>
      <defs>
        <Linear id={id("front")} at={[15, 16, 43, 41]} of={FRONT} />
        <Radial id={id("shine")} at={[19, 18, 21]} of={SHINE} />
        <Linear id={id("back")} at={[4, 6, 30, 30]} of={BACK} />
        <Linear id={id("ink")} at={[20, 24, 38, 29]} of={INK} />
        <Cut
          id={id("cut")}
          outline="M22.5 14H35.5A9.5 9.5 0 0 1 45 23.5V29.5A9.5 9.5 0 0 1 35.5 39H22.5A9.5 9.5 0 0 1 13 29.5V23.5A9.5 9.5 0 0 1 22.5 14Z"
        />
      </defs>
      <path
        clipPath={url("cut")}
        d="M12 6H23A7 7 0 0 1 30 13V18A7 7 0 0 1 23 25H15.5Q7.8 25.6 3.5 29.5Q5 27.03 5 18V13A7 7 0 0 1 12 6Z"
        fill={url("back")}
        opacity="0.55"
      />
      <path d={bubble} fill={url("front")} />
      <path d={bubble} fill={url("shine")} />
      {[22, 29, 36].map((cx) => (
        <circle key={cx} cx={cx} cy="26.5" r="2.1" fill={url("ink")} />
      ))}
    </>
  );
}

/** Versions: a thick arc turning back with its arrowhead, around a dot, over a faint ring. */
function Versions() {
  const { id, url } = scope("versions");
  const arc =
    "M7.56 18.01A17.5 17.5 0 1 0 24 6.5L24 3L16.21 10.84L24 16.5L24 13A11 11 0 1 1 13.66 20.24A3.25 3.25 0 0 0 7.56 18.01Z";
  return (
    <>
      <defs>
        <Linear id={id("front")} at={[6, 6, 42, 42]} of={FRONT} />
        <Radial id={id("shine")} at={[11, 9, 26]} of={SHINE} />
        <Linear id={id("back")} at={[6, 6, 42, 42]} of={BACK} />
        <Linear id={id("dot")} at={[19, 19, 29, 29]} of={FRONT} />
      </defs>
      <path
        fillRule="evenodd"
        d="M24 6.5A17.5 17.5 0 0 1 24 41.5A17.5 17.5 0 0 1 24 6.5ZM24 13A11 11 0 0 1 24 35A11 11 0 0 1 24 13Z"
        fill={url("back")}
        opacity="0.25"
      />
      <path d={arc} fill={url("front")} />
      <path d={arc} fill={url("shine")} />
      <circle cx="24" cy="24" r="4.5" fill={url("dot")} />
    </>
  );
}

/** AI layer: a large four-point sparkle in a soft glow, a small light one and a spark. */
function Ai() {
  const { id, url } = scope("ai");
  const sparkle =
    "M20.5 10Q25.3 21.9 36.5 27Q25.3 32.1 20.5 44Q15.7 32.1 4.5 27Q15.7 21.9 20.5 10Z";
  return (
    <>
      <defs>
        <Linear id={id("front")} at={[5, 10, 36, 44]} of={FRONT} />
        <Radial id={id("shine")} at={[15, 18, 18]} of={SHINE} />
        <Radial id={id("glow")} at={[20.5, 27, 19]} of={GLOW} />
        <Linear id={id("small")} at={[30, 4, 44, 19]} of={LIGHT} />
        <Linear id={id("dot")} at={[36, 26, 42, 32]} of={BACK} />
      </defs>
      <circle cx="20.5" cy="27" r="19" fill={url("glow")} />
      <path d={sparkle} fill={url("front")} />
      <path d={sparkle} fill={url("shine")} />
      <path
        d="M37 3.5Q38.88 9.5 44.5 11.5Q38.88 13.5 37 19.5Q35.13 13.5 29.5 11.5Q35.13 9.5 37 3.5Z"
        fill={url("small")}
      />
      <circle cx="39.5" cy="28.5" r="2.2" fill={url("dot")} opacity="0.6" />
    </>
  );
}

/** PDF and DOCX: two pages fanned out, the one behind deeper and turned away. */
function Export() {
  const { id, url } = scope("export");
  const page =
    "M24 7H32.5Q33.5 7 34.21 7.71L40.29 13.79Q41 14.5 41 15.5V35A4 4 0 0 1 37 39H24A4 4 0 0 1 20 35V11A4 4 0 0 1 24 7Z";
  return (
    <>
      <defs>
        <Linear id={id("front")} at={[19, 6, 42, 40]} of={FRONT} />
        <Radial id={id("shine")} at={[23, 9, 21]} of={SHINE} />
        <Linear id={id("back")} at={[7, 6, 33, 42]} of={BACK} />
        <Linear id={id("ink")} at={[24, 14, 38, 33]} of={INK} />
        <Cut
          id={id("cut")}
          outline="M24 5H37A6 6 0 0 1 43 11V35A6 6 0 0 1 37 41H24A6 6 0 0 1 18 35V11A6 6 0 0 1 24 5Z"
        />
      </defs>
      <g clipPath={url("cut")}>
        <path
          transform="rotate(-15 22 40)"
          d="M15.5 9.5H24Q25 9.5 25.71 10.21L31.29 15.79Q32 16.5 32 17.5V36A3.5 3.5 0 0 1 28.5 39.5H15.5A3.5 3.5 0 0 1 12 36V13A3.5 3.5 0 0 1 15.5 9.5Z"
          fill={url("back")}
          opacity="0.6"
        />
      </g>
      <path d={page} fill={url("front")} />
      <path d={page} fill={url("shine")} />
      <path d="M33.5 7V12.5Q33.5 14.5 35.5 14.5H41Z" fill={url("ink")} opacity="0.9" />
      <rect x="25" y="16" width="7.5" height="3" rx="1.5" fill={url("ink")} />
      <rect x="25" y="22" width="11.5" height="3" rx="1.5" fill={url("ink")} />
      <rect x="25" y="28" width="9" height="3" rx="1.5" fill={url("ink")} />
    </>
  );
}

/** Migration: a bright diamond moving right, two fading echoes trailing behind it. */
function Migration() {
  const { id, url } = scope("migration");
  const diamond =
    "M32.71 10.81L41.69 21.78A3.5 3.5 0 0 1 41.69 26.22L32.71 37.19A3.5 3.5 0 0 1 27.29 37.19L18.31 26.22A3.5 3.5 0 0 1 18.31 21.78L27.29 10.81A3.5 3.5 0 0 1 32.71 10.81Z";
  return (
    <>
      <defs>
        <Linear id={id("front")} at={[16, 7, 44, 41]} of={FRONT} />
        <Radial id={id("shine")} at={[25, 13, 18]} of={SHINE} />
        <Linear id={id("back")} at={[2, 13, 31, 35]} of={BACK} />
        <Cut
          id={id("cut-a")}
          outline="M34.26 9.54L43.23 20.52A5.5 5.5 0 0 1 43.23 27.48L34.26 38.46A5.5 5.5 0 0 1 25.74 38.46L16.77 27.48A5.5 5.5 0 0 1 16.77 20.52L25.74 9.54A5.5 5.5 0 0 1 34.26 9.54Z"
        />
        <Cut
          id={id("cut-b")}
          outline="M23.39 12.63L30.03 20.86A5 5 0 0 1 30.03 27.14L23.39 35.37A5 5 0 0 1 15.61 35.37L8.97 27.14A5 5 0 0 1 8.97 20.86L15.61 12.63A5 5 0 0 1 23.39 12.63Z"
        />
      </defs>
      <path
        clipPath={url("cut-b")}
        d="M12.96 16.99L17.28 22.45A2.5 2.5 0 0 1 17.28 25.55L12.96 31.01A2.5 2.5 0 0 1 9.04 31.01L4.72 25.55A2.5 2.5 0 0 1 4.72 22.45L9.04 16.99A2.5 2.5 0 0 1 12.96 16.99Z"
        fill={url("back")}
        opacity="0.4"
      />
      <path
        clipPath={url("cut-a")}
        d="M21.83 13.89L28.48 22.11A3 3 0 0 1 28.48 25.89L21.83 34.11A3 3 0 0 1 17.17 34.11L10.52 25.89A3 3 0 0 1 10.52 22.11L17.17 13.89A3 3 0 0 1 21.83 13.89Z"
        fill={url("back")}
        opacity="0.7"
      />
      <path d={diamond} fill={url("front")} />
      <path d={diamond} fill={url("shine")} />
    </>
  );
}

/** Views and themes: four looks as tiles in four shades, one split light and dark. */
function Views() {
  const { id, url } = scope("views");
  return (
    <>
      <defs>
        <Linear id={id("front")} at={[7, 7, 22, 22]} of={FRONT} />
        <Radial id={id("shine")} at={[9, 9, 12]} of={SHINE} />
        <Linear id={id("light")} at={[26, 7, 41, 22]} of={LIGHT} />
        <Linear id={id("back")} at={[7, 26, 22, 41]} of={BACK} />
        <Linear id={id("half-light")} at={[26, 26, 36, 36]} of={LIGHT} />
        <Linear id={id("half-dark")} at={[30, 30, 41, 41]} of={DEEP} />
        <clipPath id={id("split")}>
          <rect x="26" y="26" width="15" height="15" rx="4.5" />
        </clipPath>
      </defs>
      <rect x="7" y="7" width="15" height="15" rx="4.5" fill={url("front")} />
      <rect x="7" y="7" width="15" height="15" rx="4.5" fill={url("shine")} />
      <rect x="26" y="7" width="15" height="15" rx="4.5" fill={url("light")} />
      <rect x="7" y="26" width="15" height="15" rx="4.5" fill={url("back")} opacity="0.5" />
      <g clipPath={url("split")}>
        <path d="M26 26H41V41H26Z" fill={url("half-dark")} />
        <path d="M26 26H41L26 41Z" fill={url("half-light")} />
      </g>
    </>
  );
}

/** Your own cloud: a cloud lit from inside at the top left, over a server slab with two lights. */
function Cloud() {
  const { id, url } = scope("cloud");
  return (
    <>
      <defs>
        <Linear id={id("front")} at={[7, 7, 43, 32]} of={FRONT} />
        <Radial id={id("shine")} at={[17, 11, 20]} of={SHINE} />
        <Linear id={id("back")} at={[12, 35, 36, 42]} of={BACK} />
        <Linear id={id("led")} at={[14, 37, 22, 40]} of={LIGHT} />
        <clipPath id={id("shape")}>
          <circle cx="15" cy="24.5" r="7.5" />
          <circle cx="26.5" cy="18" r="11" />
          <circle cx="36" cy="25" r="7" />
          <rect x="7.5" y="21" width="35.5" height="11" rx="5.5" />
        </clipPath>
      </defs>
      <g clipPath={url("shape")}>
        <rect x="6" y="6" width="38" height="28" fill={url("front")} />
        <rect x="6" y="6" width="38" height="28" fill={url("shine")} />
      </g>
      <rect x="12" y="35" width="24" height="7" rx="3" fill={url("back")} opacity="0.7" />
      <circle cx="16" cy="38.5" r="1.4" fill={url("led")} />
      <circle cx="20.5" cy="38.5" r="1.4" fill={url("led")} />
    </>
  );
}

const DRAWINGS: Record<PartIconName, ComponentType> = {
  block: Block,
  page: Page,
  comments: Comments,
  versions: Versions,
  ai: Ai,
  export: Export,
  migration: Migration,
  views: Views,
  cloud: Cloud,
};

/**
 * One of the nine parts of the stack (the feature grid): filled shapes, a bright front shape over
 * deeper or see-through ones, lit from the top left, readable from 48 px. Colours come only from
 * the site-glyph-* tone classes; ids are gt-part-<name>-…, as each part appears once on a page.
 * Decoration: the card's heading names the part.
 */
export function PartIcon({ name }: { name: PartIconName }) {
  const Drawing = DRAWINGS[name];
  return (
    <svg viewBox="0 0 48 48" className="site-part-icon" aria-hidden="true" focusable="false">
      <Drawing />
    </svg>
  );
}
