import { GoTipeError } from "../error";
import type { GoTipeEditor } from "../types/editor";
import { defineExtension } from "../types/extension";
import type { BlockView } from "../types/view";
import { editorScoped } from "./scoped";

export interface TrailingNodeOptions {
  /** Type of the block kept at the end; it must hold rich text. Default `"paragraph"`. */
  node: string;
  /**
   * More types of last block that need nothing after it. They extend `paragraph` and `node`,
   * which never get a block after them.
   */
  notAfter: string[];
}

const NOT_AFTER = ["paragraph"];

const isEmpty = (block: BlockView) =>
  block.children.length === 0 &&
  (!Array.isArray(block.content) || block.content.every((span) => !span.text));

/**
 * Appends an empty `node` when the last top-level block is of another type and not in
 * `notAfter`, so there is always a line to type after a table, code, an image or a divider.
 * The block is added without an undo step (`metadata.addToHistory: false`) and never while
 * read-only.
 *
 * Alone, the editor keeps the block after loading, every change, Undo and `setContent`.
 * With collaboration the document on every replica must stay the same: the paragraph added
 * to the loaded document is taken back before the baseline is fixed, and afterwards only the
 * replica whose own edit leaves the document ending with another block appends one — never
 * a replica that merely received that change or repaired atoms after it.
 */
class TrailingNodeController {
  private stops: (() => void)[];
  private busy = false;
  private collaborating = false;
  /** A local dispatch has committed and its `update` has not come yet. */
  private ownEdit = false;
  /** The block appended to a loaded document, while it is the untouched last block. */
  private loaded: string | null = null;

  constructor(
    private editor: GoTipeEditor,
    private options: TrailingNodeOptions,
  ) {
    this.stops = [
      editor.on("transaction", ({ transaction }) => {
        // A repair after a remote update (`origin: "repair"`) is not an edit of this replica.
        if (this.busy || !transaction.steps.length) return;
        if (transaction.metadata?.origin !== "repair") this.ownEdit = true;
      }),
      editor.on("update", () => {
        const own = this.ownEdit;
        this.ownEdit = false;
        if (own || !this.collaborating) this.ensure(own);
      }),
      editor.on("editableChange", () => {
        if (!this.collaborating) this.ensure(false);
      }),
      editor.on("beforeCollaboration", () => this.restoreBaseline()),
    ];
    this.ensure(false);
  }

  private dispatch(steps: object[]): void {
    this.busy = true;
    try {
      this.editor.dispatch({ steps, metadata: { addToHistory: false } });
    } catch (error) {
      // A schema without the block type cannot hold it; anything else is a real failure.
      if (!(error instanceof GoTipeError && error.code === "VALIDATION_ERROR")) throw error;
    } finally {
      this.busy = false;
    }
  }

  private ensure(ownEdit: boolean): void {
    const { editor, options } = this;
    if (this.busy || editor.isDestroyed || !editor.isEditable) return;
    const { blocks } = editor.getViewState();
    const last = blocks.at(-1);
    if (!last || options.notAfter.includes(last.type)) return;
    const id = crypto.randomUUID();
    this.loaded = ownEdit ? null : id;
    this.dispatch([
      {
        type: "insertBlock",
        parentId: null,
        index: blocks.length,
        block: { id, type: options.node, attrs: {}, content: [], children: [] },
      },
    ]);
  }

  /** The document must be what was loaded: take back the block nobody has touched. */
  private restoreBaseline(): void {
    this.collaborating = true;
    const id = this.loaded;
    this.loaded = null;
    const last = this.editor.getViewState().blocks.at(-1);
    if (id && last?.id === id && last.type === this.options.node && isEmpty(last))
      this.dispatch([{ type: "deleteBlock", blockId: id }]);
  }

  destroy(): void {
    for (const stop of this.stops.splice(0)) stop();
  }
}

const controllers = editorScoped<TrailingNodeController>();

export const TrailingNode = defineExtension<TrailingNodeOptions>({
  name: "trailingNode",
  options: { node: "paragraph", notAfter: [] },
  onCreate(editor) {
    const options: Partial<TrailingNodeOptions> = this.options ?? {};
    const node = options.node ?? "paragraph";
    // A last block of type `node` needs no other one: appending it again would never end.
    const notAfter = [...new Set([...NOT_AFTER, node, ...(options.notAfter ?? [])])];
    controllers.attach(editor, new TrailingNodeController(editor, { node, notAfter }));
  },
  onDestroy(editor) {
    controllers.detach(editor);
  },
});
