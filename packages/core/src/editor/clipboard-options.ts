import type { ClipboardOptions, PastedTextHooks } from "../clipboard/paste-rules";
import type { CreateEditorOptions, GoTipeEditor } from "../types/editor";
import { type Extension, defineExtension } from "../types/extension";
import { atomSupport, buildSchema } from "./extensions";

function pastedTextHooks(extensions: Extension[]): PastedTextHooks | undefined {
  const transforms: PastedTextHooks["transforms"] = [];
  const parsers: PastedTextHooks["parsers"] = [];
  for (const { transformPastedText, parsePastedText, options } of extensions) {
    if (transformPastedText) transforms.push({ run: transformPastedText, options });
    if (parsePastedText) parsers.push({ run: parsePastedText, options });
  }
  return transforms.length || parsers.length
    ? { transforms, parsers, schema: buildSchema(extensions) }
    : undefined;
}

export function clipboardOptions(
  extensions: Extension[],
  create: (options: CreateEditorOptions) => Promise<GoTipeEditor>,
): ClipboardOptions {
  const rules = extensions.flatMap((extension) =>
    (extension.pasteRules ?? []).map((rule) => ({ rule, options: extension.options })),
  );
  const text = pastedTextHooks(extensions);
  const html = { ...buildSchema(extensions), atoms: atomSupport(extensions) };
  if (!rules.length) return text ? { text, schema: html } : { schema: html };
  // No plugin factories or hooks run twice, and uploading remains owned by the host.
  const schema = extensions.map((extension) =>
    defineExtension({ name: extension.name, nodes: extension.nodes, marks: extension.marks }),
  );
  return {
    rules,
    text,
    schema: html,
    createDraft: async (document, selection, host) => {
      const draft = await create({
        extensions: schema,
        content: document,
        host,
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
