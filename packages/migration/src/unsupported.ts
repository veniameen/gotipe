/**
 * Content that a converter cannot represent in a GoTipe document. With `strict: true` the
 * converters throw it; otherwise they keep the source subtree in a `markdownRaw` block.
 */
export class UnsupportedContent extends Error {
  /** What cannot be represented, without the location. */
  readonly reason: string;
  /** Path of the content in the source JSON, such as `content[1]`, once it is known. */
  readonly path: string | undefined;

  constructor(reason: string, location?: { source: string; path: string }) {
    super(location ? `${location.source} ${location.path}: ${reason}` : reason);
    this.name = "UnsupportedContent";
    this.reason = reason;
    this.path = location?.path;
  }
}
