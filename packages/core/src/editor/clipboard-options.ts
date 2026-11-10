import type { ClipboardOptions } from "../clipboard/paste-rules";
import type { CreateEditorOptions, GoTipeEditor } from "../types/editor";
import { type Extension, defineExtension } from "../types/extension";

export function clipboardOptions(
  extensions: Extension[],
  editor: GoTipeEditor,
  create: (options: CreateEditorOptions) => Promise<GoTipeEditor>,
): ClipboardOptions {
  const rules = extensions.flatMap((extension) =>
    (extension.pasteRules ?? []).map((rule) => ({ rule, options: extension.options })),
  );
  if (!rules.length) return {};
  // No plugin factories or hooks run twice, and uploading remains owned by the host.
  const schema = extensions.map((extension) =>
    defineExtension({ name: extension.name, nodes: extension.nodes, marks: extension.marks }),
  );
  return {
    rules,
    createDraft: async (document, selection) => {
      const draft = await create({
        extensions: schema,
        content: document,
        host: editor.host,
        engine: "js",
      });
      try {
        draft.dispatch({
          steps: [],
          selection:
            selection.type === "multi"
              ? { type: "multi", blockIds: selection.blockIds ?? [] }
              : selection.type === "block"
                ? { type: "block", blockId: selection.anchor.blockId }
                : { type: "range", anchor: selection.anchor, head: selection.head },
        });
        return draft;
      } catch (error) {
        draft.destroy();
        throw error;
      }
    },
  };
}
