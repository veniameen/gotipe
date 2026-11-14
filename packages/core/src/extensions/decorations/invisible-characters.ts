import { flattenBlocks } from "../../document/tree";
import type { GoTipeEditor } from "../../types/editor";
import { defineExtension } from "../../types/extension";
import type { BlockView, Decoration } from "../../types/view";
import { editorScoped } from "../scoped";

export interface InvisibleCharactersOptions {
  /** Shown from the start. Default `false`. */
  visible: boolean;
}

/** The decoration layer of invisible characters. */
export const INVISIBLES_LAYER = "invisibles";

/** Kind of an invisible character → its class, as in Atlas frame 28 (`data-gotipe-invisible`). */
const KINDS: Record<string, [kind: string, className: string]> = {
  " ": ["space", "gotipe-sp"],
  "\u00a0": ["nbsp", "gotipe-nbsp"],
  "\u202f": ["nbsp", "gotipe-nbsp"],
  "\n": ["break", "gotipe-br"],
};

function blockDecorations(block: BlockView, text: string): Decoration[] {
  const decorations: Decoration[] = [];
  for (let offset = 0; offset < text.length; offset++) {
    const found = KINDS[text[offset]!];
    if (!found) continue;
    decorations.push({
      type: "inline",
      key: `invisible-${offset}`,
      blockId: block.id,
      from: offset,
      to: offset + 1,
      className: found[1],
      attrs: { "data-gotipe-invisible": found[0] },
    });
  }
  decorations.push({
    type: "widget",
    key: "invisible-end",
    blockId: block.id,
    offset: text.length,
    className: "gotipe-pilcrow",
    attrs: { "data-gotipe-invisible": "paragraph" },
  });
  return decorations;
}

class InvisibleCharactersController {
  private stop: () => void;
  private cache = new WeakMap<object, { id: string; decorations: Decoration[] }>();

  constructor(
    private editor: GoTipeEditor,
    public visible: boolean,
  ) {
    this.stop = editor.on("update", () => this.paint());
    this.paint();
  }

  set(visible: boolean): void {
    this.visible = visible;
    this.paint();
  }

  /** Spaces, no-break spaces and line breaks of rich text, and the end of each such block. */
  private paint(): void {
    if (!this.visible) {
      this.editor.setDecorations(INVISIBLES_LAYER, []);
      return;
    }
    const decorations: Decoration[] = [];
    for (const block of flattenBlocks(this.editor.getViewState().blocks)) {
      const content = block.content;
      if (!Array.isArray(content)) continue;
      let own = this.cache.get(content);
      if (own?.id !== block.id) {
        const text = content.map((span) => span.text).join("");
        own = { id: block.id, decorations: blockDecorations(block, text) };
        this.cache.set(content, own);
      }
      decorations.push(...own.decorations);
    }
    this.editor.setDecorations(INVISIBLES_LAYER, decorations);
  }

  destroy(): void {
    this.stop();
    if (!this.editor.isDestroyed) this.editor.setDecorations(INVISIBLES_LAYER, []);
  }
}

const controllers = editorScoped<InvisibleCharactersController>();

/**
 * A decoration layer that shows spaces, no-break spaces, line breaks and paragraph ends,
 * off by default. The renderers draw it with the classes `gotipe-sp`, `gotipe-nbsp`,
 * `gotipe-br` and `gotipe-pilcrow`; the document never changes.
 */
export const InvisibleCharacters = defineExtension<InvisibleCharactersOptions>({
  name: "invisibleCharacters",
  options: { visible: false },
  onCreate(editor) {
    controllers.attach(
      editor,
      new InvisibleCharactersController(editor, this.options?.visible === true),
    );
  },
  onDestroy(editor) {
    controllers.detach(editor);
  },
});

/** Shows or hides invisible characters; `false` without the extension. */
export function setInvisibleCharacters(editor: GoTipeEditor, visible: boolean): boolean {
  const controller = controllers.get(editor);
  controller?.set(visible);
  return !!controller;
}

export function toggleInvisibleCharacters(editor: GoTipeEditor): boolean {
  return setInvisibleCharacters(editor, !isInvisibleCharactersVisible(editor));
}

export function isInvisibleCharactersVisible(editor: GoTipeEditor): boolean {
  return controllers.get(editor)?.visible === true;
}
