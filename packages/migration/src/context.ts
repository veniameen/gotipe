import {
  type AttrValue,
  type Block,
  type BlockContent,
  type Mark,
  type NodeSpec,
  type TextSpan,
  createId,
} from "@gotipe/core";
import { type BlockRef, MigrationReport, type Quiet, type ReportMark, blockJSON } from "./report";
import {
  ITEM_LISTS,
  RAW,
  accepts,
  fitAttributes,
  holds,
  isTextContainer,
  markSpec,
  nodeSpec,
} from "./schema";
import type { SourceNode } from "./source";
import { writeLines } from "./text";
import type { MigrationOptions, MigrationResult } from "./types";
import { UnsupportedContent } from "./unsupported";

/** Fields of an inline element, a mark or another source object, reported for its block. */
export interface Note {
  path: string;
  sourceType: string;
  fields: SourceNode;
}

/** A converted source node before it is fitted to the GoTipe schema. */
export interface Draft {
  type: string;
  sourceType: string;
  /** Path of the source node. */
  path: string;
  /** Candidate attributes under GoTipe names; the ones the schema does not declare are reported. */
  attrs: SourceNode;
  /** Path of the source object that holds `attrs`, when it is not the node itself. */
  attrsPath?: string;
  content: TextSpan[];
  children: Block[];
  /** Source ID requested for the block, and the path of the object that holds it. */
  id?: AttrValue;
  idPath?: string;
  /** Fields of the node that are known to have no GoTipe attribute. */
  unmapped?: SourceNode;
  notes?: Note[];
}

/** What the shared conversion needs to know about one source format. */
export interface SourceFormat {
  /** Source editor defaults that are reported in `unmapped` without a warning. */
  quiet?: Quiet;
  /** The source ID of a node, reused for its `markdownRaw` block when it is preserved. */
  idOf?: (value: SourceNode) => AttrValue | undefined;
}

interface Claim {
  ref: BlockRef;
  /** Path of the source node, and of the source object that holds its ID. */
  path: string;
  idPath: string;
  sourceType: string;
  order: number;
  fromSource: boolean;
}

type Checkpoint = readonly [report: ReportMark, claims: number];

function holdsChildren(spec: NodeSpec): boolean {
  return spec.allowsChildren && !spec.leaf;
}

function fitContent(type: string, spec: NodeSpec | undefined, content: TextSpan[]): BlockContent {
  if (!spec) return content;
  if (spec.content === "empty") {
    if (content.some((span) => span.text !== ""))
      throw new UnsupportedContent(`Text in ${type} cannot be represented`);
    return null;
  }
  if (spec.content === "rawText") {
    if (content.some((span) => span.marks.length > 0))
      throw new UnsupportedContent(`Formatted text in ${type} cannot be represented as raw text`);
    return content.map((span) => span.text).join("");
  }
  const allowed = spec.marksAllowed;
  for (const span of content)
    for (const mark of span.marks)
      if (allowed === "none" || (Array.isArray(allowed) && !allowed.includes(mark.type)))
        throw new UnsupportedContent(`Mark ${mark.type} is not allowed in ${type}`);
  return content;
}

/**
 * Owns block IDs, the report and the fit of converted nodes to the GoTipe schema for one
 * conversion. Converters describe source nodes; this decides what the document may contain.
 */
export class MigrationContext {
  private readonly report = new MigrationReport();
  private readonly claims: string[] = [];
  private readonly byId = new Map<string, Claim>();
  private readonly frames: number[] = [];
  private readonly wrappers = new WeakSet<Block>();
  private order = 0;

  constructor(
    readonly source: string,
    private readonly options: MigrationOptions,
    private readonly format: SourceFormat = {},
  ) {}

  /**
   * Converts one source node placed under `parent`, a GoTipe type or `null` for the top level.
   * Unsupported content undoes what the node recorded and keeps its JSON in a `markdownRaw`
   * block; where the schema does not allow one, the nearest ancestor that can be one is kept.
   */
  recover(value: SourceNode, path: string, parent: string | null, convert: () => Block): Block {
    const checkpoint = this.checkpoint();
    this.frames.push(this.order++);
    try {
      const block = convert();
      if (!accepts(parent, block.type)) {
        const place = parent === null ? "a top-level block" : `inside ${parent}`;
        throw new UnsupportedContent(`${block.type} cannot be ${place}`);
      }
      return block;
    } catch (error) {
      if (!(error instanceof UnsupportedContent)) throw error;
      const located =
        error.path === undefined
          ? new UnsupportedContent(error.reason, { source: this.source, path })
          : error;
      if (this.options.strict) throw located;
      this.restore(checkpoint);
      if (!accepts(parent, RAW)) throw located;
      return this.preserve(value, path, located);
    } finally {
      this.frames.pop();
    }
  }

  /** Fits a converted node to the GoTipe schema; throws `UnsupportedContent` when it cannot. */
  block(draft: Draft): Block {
    const claim = this.claim(draft.id, draft.path, draft.sourceType, draft.idPath);
    const spec = nodeSpec(draft.type);
    let content = draft.content;
    let children = this.wrap(draft.children, draft.type);
    if (spec && isTextContainer(draft.type))
      [content, children] = this.absorb(claim, spec, draft.type, content, children);
    let attrs = draft.attrs;
    let rest: SourceNode = { ...draft.unmapped };
    if (spec) {
      const fitted = fitAttributes(spec.attrs, draft.attrs);
      if (fitted.missing) throw new UnsupportedContent(`${draft.type} requires ${fitted.missing}`);
      attrs = fitted.kept;
      rest = { ...rest, ...fitted.rest };
      if (children.length && !holdsChildren(spec))
        throw new UnsupportedContent(`${draft.type} cannot contain blocks`);
    }
    const block: Block = {
      id: claim.ref.id,
      type: draft.type,
      attrs,
      content: fitContent(draft.type, spec, content),
      children,
    };
    const at = draft.attrsPath ?? draft.path;
    this.report.unmapped(claim.ref, claim.order, at, draft.sourceType, rest);
    for (const note of draft.notes ?? [])
      this.report.unmapped(claim.ref, claim.order, note.path, note.sourceType, note.fields);
    return block;
  }

  /** A mark that fits the GoTipe schema; the attributes it does not declare go to `notes`. */
  mark(type: string, attrs: SourceNode, path: string, sourceType: string, notes: Note[]): Mark {
    const spec = markSpec(type);
    if (!spec) return { type, attrs: { ...attrs } };
    const fitted = fitAttributes(spec.attrs, attrs);
    if (fitted.missing) throw new UnsupportedContent(`Mark ${type} requires ${fitted.missing}`);
    notes.push({ path, sourceType, fields: fitted.rest });
    return { type, attrs: fitted.kept };
  }

  /** Reports fields of a source node whose content became an already converted block. */
  attach(block: Block, path: string, sourceType: string, fields: SourceNode): void {
    const claim = this.byId.get(block.id);
    if (claim) this.report.unmapped(claim.ref, this.frames.at(-1) ?? -1, path, sourceType, fields);
  }

  result(blocks: Block[], root: Note[] = []): MigrationResult {
    const document = { blocks: this.wrap(blocks, null), version: 1 };
    for (const note of root)
      this.report.unmapped(null, -1, note.path, note.sourceType, note.fields);
    const { warnings, preserved, unmapped } = this.report.finish(this.source, this.format.quiet);
    for (const message of warnings) this.options.onWarning?.(message);
    return {
      document,
      warnings,
      skippedNodes: 0,
      preservedNodes: preserved.length,
      preserved,
      unmapped,
    };
  }

  private preserve(value: SourceNode, path: string, error: UnsupportedContent): Block {
    const reason = error.path === path ? error.reason : `${error.reason} (at ${error.path})`;
    this.report.warn(`${this.source} ${path}: ${reason}; source preserved as markdownRaw`);
    const sourceType = typeof value.type === "string" ? value.type : "unknown";
    const sourceId = this.format.idOf?.(value);
    const claim = this.claim(typeof sourceId === "string" ? sourceId : undefined, path, sourceType);
    this.report.preserve({ blockId: claim.ref.id, path, sourceType, reason });
    return {
      id: claim.ref.id,
      type: RAW,
      attrs: { kind: "json" },
      content: JSON.stringify(value, null, 2),
      children: [],
    };
  }

  private claim(
    requested: AttrValue | undefined,
    path: string,
    sourceType: string,
    idPath = path,
  ): Claim {
    let id: string | undefined;
    if (typeof requested === "string" && requested.trim() !== "") {
      if (!this.byId.has(requested)) id = requested;
      else
        this.report.warn(
          `${this.source} ${path}: Duplicate source ID ${requested}; generated a replacement`,
        );
    }
    const fromSource = id !== undefined;
    id ??= this.options.createId?.() ?? createId();
    if (typeof id !== "string" || id === "" || this.byId.has(id))
      throw new Error("Migration ID factory must return unique nonempty strings");
    const order = this.frames.at(-1) ?? -1;
    const claim: Claim = { ref: { id }, path, idPath, sourceType, order, fromSource };
    this.claims.push(id);
    this.byId.set(id, claim);
    if (!fromSource && requested !== undefined)
      this.report.unmapped(claim.ref, order, idPath, sourceType, { id: requested });
    return claim;
  }

  /**
   * The first paragraph of a container without text becomes its text. A container without
   * children, a table cell, writes all its blocks as lines of its text: paragraphs, headings
   * and lists keep their text and marks; what else made them a block is reported.
   */
  private absorb(
    container: Claim,
    spec: NodeSpec,
    type: string,
    content: TextSpan[],
    children: Block[],
  ): [TextSpan[], Block[]] {
    const started = content.some((span) => span.text !== "");
    const first = children[0]?.type === "paragraph" && !started;
    const taken = holdsChildren(spec) ? children.slice(0, first ? 1 : 0) : children;
    if (!taken.length) return [content, children];
    const text = first ? [] : content;
    const written = writeLines(text, taken, type, started);
    for (const block of written) {
      const claim = this.byId.get(block.id);
      if (claim) claim.ref.into = container.ref;
    }
    for (const block of taken) this.lose(container, block);
    return [text, children.slice(taken.length)];
  }

  /** Reports what a block that became its container's text no longer has. */
  private lose(container: Claim, block: Block): void {
    const claim = this.byId.get(block.id);
    if (!claim) return;
    if (block.type !== "paragraph") {
      const fields = { block: blockJSON(block) };
      const into = container.sourceType;
      this.report.flattened(container.ref, claim.order, claim.path, claim.sourceType, into, fields);
      return;
    }
    const lost: SourceNode = { ...block.attrs };
    if (claim.fromSource) lost.id = block.id;
    this.report.unmapped(container.ref, claim.order, claim.idPath, claim.sourceType, lost);
  }

  /** Puts list items that are outside a list of their kind into a new list. */
  private wrap(blocks: Block[], parent: string | null): Block[] {
    const result: Block[] = [];
    for (const block of blocks) {
      const list = ITEM_LISTS[block.type];
      if (list === undefined || holds(parent, block.type) || !holds(parent, list)) {
        result.push(block);
        continue;
      }
      const previous = result.at(-1);
      if (previous?.type === list && this.wrappers.has(previous)) {
        previous.children.push(block);
        continue;
      }
      const wrapper: Block = {
        id: this.claim(undefined, "", list).ref.id,
        type: list,
        attrs: {},
        content: null,
        children: [block],
      };
      this.wrappers.add(wrapper);
      result.push(wrapper);
    }
    return result;
  }

  private checkpoint(): Checkpoint {
    return [this.report.mark(), this.claims.length];
  }

  private restore([report, claims]: Checkpoint): void {
    this.report.restore(report);
    for (const id of this.claims.splice(claims)) this.byId.delete(id);
  }
}
