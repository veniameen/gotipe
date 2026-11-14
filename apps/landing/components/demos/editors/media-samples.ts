/**
 * Bundled sample media: an SVG picture and a small text file as data: URLs, so the demo needs no
 * network and stores nothing. The picture's colours are content of the sample, not UI colours.
 */
const svg = (body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">${body}</svg>`,
  )}`;

export const SAMPLE_IMAGE = svg(
  [
    '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="#dbe6fb"/><stop offset="1" stop-color="#f6f7f9"/>',
    "</linearGradient></defs>",
    '<rect width="640" height="320" fill="url(#s)"/>',
    '<circle cx="488" cy="96" r="38" fill="#f4c46a"/>',
    '<path d="M0 250 L130 150 L230 220 L350 120 L470 230 L560 180 L640 230 V320 H0Z" fill="#8fa9d8"/>',
    '<path d="M0 280 L160 210 L300 270 L420 220 L640 290 V320 H0Z" fill="#2c62d4"/>',
  ].join(""),
);

const NOTES = "Release notes\n\n- Offline drafts\n- Faster tables\n";

export const SAMPLE_FILE = {
  url: `data:text/plain;charset=utf-8,${encodeURIComponent(NOTES)}`,
  name: "release-notes.txt",
  size: new TextEncoder().encode(NOTES).length,
  mime_type: "text/plain",
};
