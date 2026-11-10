import { GoTipeError } from "../error";
import type { GoTipeEditor } from "../types/editor";
import type { Extension, Plugin } from "../types/extension";
import type { EditorState, Selection } from "../types/state";

/** One owner for extension hooks, plugin state notifications and decoration layers. */
export function createExtensionLifecycle(extensions: Extension[], editor: GoTipeEditor) {
  const active: { extension: Extension; plugin?: Plugin; layer: string }[] = [];
  const subscriptions: (() => void)[] = [];
  let disposed = false;
  const snapshot = (): EditorState => {
    const view = editor.getViewState().selection;
    const selection: Selection =
      view.type === "multi"
        ? { type: "multi", blockIds: [...(view.blockIds ?? [])] }
        : view.type === "block"
          ? { type: "block", blockId: view.anchor.blockId }
          : { type: "range", anchor: { ...view.anchor }, head: { ...view.head } };
    return { doc: editor.getJSON(), selection };
  };
  const report = (error: unknown, extension: string) =>
    editor.reportError(
      new GoTipeError(
        "EXTENSION_ERROR",
        error instanceof Error ? error.message : "Extension callback failed",
        { extension },
      ),
    );
  const call = (extension: string, callback: () => void) => {
    try {
      callback();
    } catch (error) {
      report(error, extension);
    }
  };
  const decorate = () => {
    if (disposed) return;
    for (const { extension, plugin, layer } of active) {
      if (!plugin?.decorations) continue;
      call(extension.name, () => editor.setDecorations(layer, plugin.decorations!(snapshot())));
    }
  };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    for (const stop of subscriptions.splice(0)) stop();
    for (const { extension, plugin, layer } of active.reverse()) {
      call(extension.name, () => plugin?.destroy?.());
      call(extension.name, () => extension.onDestroy?.(editor));
      editor.setDecorations(layer, []);
    }
    active.length = 0;
  };
  try {
    for (const extension of extensions) {
      const entry = {
        extension,
        plugin: undefined as Plugin | undefined,
        layer: `extension:${extension.name}`,
      };
      active.push(entry);
      entry.plugin = extension.plugin?.(extension.options);
      entry.plugin?.init?.(snapshot());
      extension.onCreate?.(editor);
    }
    subscriptions.push(
      editor.on("transaction", ({ transaction }) => {
        if (disposed) return;
        for (const { extension, plugin } of active)
          if (plugin?.apply)
            call(extension.name, () => plugin.apply!(structuredClone(transaction), snapshot()));
      }),
    );
    subscriptions.push(
      editor.on("update", () => {
        for (const { extension } of active)
          call(extension.name, () => extension.onUpdate?.(editor));
        decorate();
      }),
    );
    subscriptions.push(editor.on("selectionChange", decorate));
    decorate();
  } catch (error) {
    destroy();
    throw error;
  }
  return { destroy };
}
