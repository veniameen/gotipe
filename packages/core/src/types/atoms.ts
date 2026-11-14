import type { Document, Mark } from "./block";
import type { Step } from "./state";
import type { BlockView } from "./view";

/** Whether a mark type is declared atomic by the schema. */
export type IsAtomic = (markType: string) => boolean;

/** How imported HTML reads inline atoms (`serializeHtml` writes them). */
export interface HtmlAtomReader {
  /** Whether a paragraph's images are inline content rather than image blocks. */
  inlineImages(images: readonly Element[]): boolean;
  /** The atomic mark a `<span data-type>` element adds to its text, or null. */
  span(element: HTMLElement): Mark | null;
  /** The text and atomic mark of an inline `<img>`; the mark is null for plain alt text. */
  image(element: HTMLElement): { text: string; mark: Mark | null };
}

/**
 * What atomic marks need beyond the rules the editor applies to any `atomic` mark
 * (docs/development/inline-atoms.md): the repair of remote text typed into an atom and the
 * HTML read-back of the built-in atoms. The built-in atom extensions carry one; the editor
 * loads none of this code unless an extension supplies it.
 */
export interface InlineAtomSupport {
  /** Remembers the atoms of the blocks a local wire transaction is about to change. */
  rememberLocal(blocks: readonly BlockView[], transaction: string, isAtomic: IsAtomic): void;
  /** The steps that repair text a peer typed into an atom, after a collaboration update. */
  repairRemote(before: Document, after: Document, isAtomic: IsAtomic): Step[];
  /** Reads the atoms of imported HTML whose marks `schema` declares. */
  readHtml(schema: {
    nodes: Readonly<Record<string, unknown>>;
    marks: Readonly<Record<string, unknown>>;
  }): HtmlAtomReader;
}
