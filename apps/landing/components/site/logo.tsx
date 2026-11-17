/**
 * The GoTipe mark: the manta on its night tile, a raster drawn from public/brand/ in three widths
 * (the browser picks one by the place's width and the screen's density). Every place of the mark
 * stands beside the name or inside a decoration, so the image itself is silent (`alt=""`).
 */
const WIDTHS = [64, 128, 256];

const source = (width: number) => `/brand/gotipe-logo-${width}.webp`;

const SRC_SET = WIDTHS.map((width) => `${source(width)} ${width}w`).join(", ");

/**
 * The places of the mark and the width each draws it at (`--site-logo*`, `--site-stack-hub-mark`);
 * `sizes` must follow them for the browser to pick a width.
 */
const PLACES = {
  head: 28,
  foot: 32,
  hub: 72,
} as const;

export type LogoPlace = keyof typeof PLACES;

export interface LogoProps {
  place: LogoPlace;
  className?: string;
}

export function Logo({ place, className = "site-logo" }: LogoProps) {
  const width = PLACES[place];
  return (
    <img
      className={className}
      src={source(WIDTHS[WIDTHS.length - 1])}
      srcSet={SRC_SET}
      sizes={`${width}px`}
      width={width}
      height={width}
      alt=""
      decoding="async"
      draggable={false}
    />
  );
}

/** The manta's mask: white manta on black (public/brand/gotipe-manta.png, cut from the logo). */
const MANTA = "/brand/gotipe-manta.png";
const MANTA_MASK = "site-manta-mask";

/**
 * The manta alone, without its tile, in the colour of its place (`currentColor`): for a mark that
 * has to glow through glass, as on the engine plate of the closing band. Decoration.
 */
export function MantaMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <mask id={MANTA_MASK} maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
        <image href={MANTA} width="256" height="256" />
      </mask>
      <rect width="256" height="256" fill="currentColor" mask={`url(#${MANTA_MASK})`} />
    </svg>
  );
}
