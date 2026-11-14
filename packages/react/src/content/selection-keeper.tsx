import type { GoTipeEditor, ViewState } from "@gotipe/core";
import { Component, type ReactNode } from "react";

type Selection = NonNullable<ReturnType<GoTipeEditor["getDOMSelection"]>>;
interface Props {
  editor: GoTipeEditor;
  state: ViewState | null;
  children?: ReactNode;
}

const same = (a: Selection, b: Selection) =>
  a.anchor.blockId === b.anchor.blockId &&
  a.anchor.offset === b.anchor.offset &&
  a.head.blockId === b.head.blockId &&
  a.head.offset === b.head.offset;

/**
 * A presentation-only render (a decoration layer changed; the document and the selection did
 * not) re-splits text nodes, which can move the native caret: another person's caret moving
 * through the paragraph being typed in, a search highlight. The native selection read before
 * the render is restored after it, through the core's own mapping. Never while the browser
 * composes (`editor.isComposing`): the selection is the IME's then, and setting it ends the
 * composition.
 */
export class SelectionKeeper extends Component<Props, Record<string, never>, Selection | null> {
  getSnapshotBeforeUpdate(previous: Props): Selection | null {
    const { editor, state } = this.props;
    const before = previous.state;
    if (previous.editor !== editor || !before || !state || before === state) return null;
    if (editor.isDestroyed || editor.isComposing || before.version !== state.version) return null;
    if (JSON.stringify(before.selection) !== JSON.stringify(state.selection)) return null;
    const element = editor.element;
    const active = element?.ownerDocument.activeElement;
    if (!element || !active || !element.contains(active)) return null;
    return editor.getDOMSelection();
  }

  componentDidUpdate(_previous: Props, _state: Record<string, never>, kept: Selection | null) {
    const { editor } = this.props;
    if (!kept || editor.isDestroyed || editor.isComposing) return;
    const current = editor.getDOMSelection();
    if (!current || !same(current, kept)) editor.setSelection(kept);
  }

  render() {
    return this.props.children;
  }
}
