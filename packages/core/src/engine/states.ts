import { createBlockDecoder, decodeHeader } from "../document/decode";
import type { Block, Document } from "../types/block";
import type { FallbackDoc } from "./types";
import { type EngineSchema, blockValidator, isSchemaFree } from "./validate";

/** What is known of a top-level block of a parsed state. */
interface KnownBlock {
  /** The block as the public document has it. */
  block: Block;
  /** Its id and the ids under it, in document order. */
  ids: readonly string[];
  /** The schema of the last `validate` allows it as a top-level block. */
  valid: boolean;
}

function idsOf(block: Block, into: string[] = []): string[] {
  into.push(block.id);
  for (const child of block.children) idsOf(child, into);
  return into;
}

/**
 * The engine states of one editor as text and as parsed documents. A state is parsed once, and
 * what is worked out for a top-level block (its text, its decoded form, that the schema allows
 * it) is kept with the block's object: an edit copies only the blocks it changes
 * (`applyTransaction`), so the next state reuses the rest.
 *
 * Parsed states and decoded blocks are shared between calls and with later states: read them,
 * never change them. Whoever hands a document out for changing decodes it anew. `recent` holds the
 * states read or written last, newest first.
 */
export class EngineStates {
  private recent: { json: string; doc: FallbackDoc }[] = [];
  private text = new WeakMap<object, string>();
  private known = new WeakMap<object, KnownBlock>();

  parse(json: string): FallbackDoc {
    // The parsed state of `json`.
    const at = this.recent.findIndex((entry) => entry.json === json);
    if (at === 0) return this.recent[0]!.doc;
    const doc = at > 0 ? this.recent.splice(at, 1)[0]!.doc : (JSON.parse(json) as FallbackDoc);
    this.remember(json, doc);
    return doc;
  }

  stringify(doc: FallbackDoc): string {
    // The text of a state, the same as `JSON.stringify` writes it.
    const fields: string[] = [];
    for (const [key, value] of Object.entries(doc)) {
      const text =
        key === "blocks" && Array.isArray(value)
          ? `[${value.map((block) => this.blockText(block)).join(",")}]`
          : JSON.stringify(value);
      if (text !== undefined) fields.push(`${JSON.stringify(key)}:${text}`);
    }
    const json = `{${fields.join(",")}}`;
    this.remember(json, doc);
    return json;
  }

  decode(doc: FallbackDoc): Document {
    // The public document of a parsed state, with the checks of `decodeDocument`. Its blocks are
    // shared with other calls.
    const { version } = decodeHeader(doc);
    return { version, blocks: this.blocks(doc).map((entry) => entry.block) };
  }

  validate(schema: EngineSchema, doc: FallbackDoc): boolean {
    // As `validateEngineDocument`: the same checks and errors, for a parsed state.
    const blocks = this.blocks(doc);
    if (isSchemaFree(schema)) return true;
    const valid = blockValidator(schema);
    return blocks.every((entry) => {
      entry.valid ||= valid(entry.block, true);
      return entry.valid;
    });
  }

  resetSchema(): void {
    // Another schema: what the last one allowed is not known to be allowed.
    this.known = new WeakMap();
  }

  private remember(json: string, doc: FallbackDoc): void {
    this.recent.unshift({ json, doc });
    if (this.recent.length > 2) this.recent.length = 2;
  }

  private blockText(block: unknown): string {
    if (!block || typeof block !== "object") return JSON.stringify(block) ?? "null";
    let text = this.text.get(block);
    if (text === undefined) {
      text = JSON.stringify(block);
      this.text.set(block, text);
    }
    return text;
  }

  private blocks(doc: FallbackDoc): KnownBlock[] {
    // Every top-level block decoded, the new ones now, in document order as one document.
    const decoder = createBlockDecoder();
    return decodeHeader(doc).blocks.map((entry) => {
      let known = entry && typeof entry === "object" ? this.known.get(entry) : undefined;
      if (known) decoder.seen(known.ids);
      else {
        const block = decoder.block(entry);
        known = { block, ids: idsOf(block), valid: false };
        this.known.set(entry as object, known);
      }
      return known;
    });
  }
}
