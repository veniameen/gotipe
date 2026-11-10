import type { GoTipeEditor } from "@gotipe/core";
import { Component, type ReactNode, createRef } from "react";

type Selection = NonNullable<ReturnType<GoTipeEditor["getDOMSelection"]>>;
interface Props {
  editor: GoTipeEditor;
  code: string;
  language: string;
  children?: ReactNode;
}

/** A token-only render must preserve native selection before React replaces nodes. */
export class CodeText extends Component<Props, Record<string, never>, Selection | null> {
  private element = createRef<HTMLElement>();
  private composing = false;
  private detach: (() => void) | undefined;
  private committedVersion = -1;
  private resumeFrame: number | null = null;

  componentDidMount() {
    this.committedVersion = this.props.editor.getViewState().version;
    this.attach();
  }

  private attach() {
    this.detach?.();
    this.composing = false;
    const owner = this.element.current?.closest("[data-gotipe-content]");
    if (!owner) return;
    const start = () => {
      if (this.resumeFrame !== null) cancelAnimationFrame(this.resumeFrame);
      this.resumeFrame = null;
      const selection = owner.ownerDocument.getSelection();
      this.composing = !!this.element.current?.contains(selection?.anchorNode ?? null);
    };
    const end = () => {
      if (!this.composing) return;
      this.composing = false;
      const editor = this.props.editor;
      // The editor first reconciles native nodes and commits the composition.
      // Rendering tokens inside that same DOM event would invalidate its snapshot.
      this.resumeFrame = requestAnimationFrame(() => {
        this.resumeFrame = null;
        if (
          this.props.editor === editor &&
          !this.composing &&
          !editor.isDestroyed &&
          this.element.current?.isConnected
        )
          this.forceUpdate();
      });
    };
    owner.addEventListener("compositionstart", start);
    owner.addEventListener("compositionend", end);
    const unsubscribe = this.props.editor.on("destroy", () => this.detach?.());
    const unsubscribeComposition = this.props.editor.on("compositionInterrupted", end);
    this.detach = () => {
      if (this.resumeFrame !== null) cancelAnimationFrame(this.resumeFrame);
      this.resumeFrame = null;
      owner.removeEventListener("compositionstart", start);
      owner.removeEventListener("compositionend", end);
      unsubscribe();
      unsubscribeComposition();
    };
  }

  componentWillUnmount() {
    this.detach?.();
  }

  shouldComponentUpdate(next: Props) {
    // Native IME owns these DOM nodes until compositionend. A newer model
    // value is handled by the editor's normal transaction reconciliation.
    return (
      next.editor !== this.props.editor ||
      (!next.editor.isDestroyed && (!this.composing || next.code !== this.props.code))
    );
  }

  getSnapshotBeforeUpdate(previous: Props): Selection | null {
    if (
      previous.editor !== this.props.editor ||
      previous.code !== this.props.code ||
      this.composing ||
      this.props.editor.isDestroyed ||
      this.props.editor.getViewState().version !== this.committedVersion
    )
      return null;
    const element = this.element.current;
    const document = element?.ownerDocument;
    const selection = document?.getSelection();
    if (!element || !selection) return null;
    if (!element.contains(selection.anchorNode) && !element.contains(selection.focusNode))
      return null;
    const active = document?.activeElement;
    if (active && active !== document?.body && active !== this.props.editor.element) return null;
    return this.props.editor.getDOMSelection();
  }

  componentDidUpdate(previous: Props, _state: Record<string, never>, snapshot: Selection | null) {
    if (previous.editor !== this.props.editor) this.attach();
    this.committedVersion = this.props.editor.getViewState().version;
    if (!snapshot || this.props.editor.isDestroyed) return;
    const current = this.props.editor.getDOMSelection();
    if (
      !current ||
      current.anchor.blockId !== snapshot.anchor.blockId ||
      current.anchor.offset !== snapshot.anchor.offset ||
      current.head.blockId !== snapshot.head.blockId ||
      current.head.offset !== snapshot.head.offset
    ) {
      this.props.editor.setSelection(snapshot);
    }
  }

  render() {
    const { code, language, children } = this.props;
    return (
      <code ref={this.element} className={`language-${language}`} data-gotipe-text-content="">
        {children ?? (code || <br data-gotipe-trailing-break="" />)}
        {code.endsWith("\n") && <br data-gotipe-trailing-break="" />}
      </code>
    );
  }
}
